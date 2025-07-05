const next = require("next");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Optimized Redis clients
const pubClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
  },
  pingInterval: 30000,
});

const subClient = pubClient.duplicate({
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
  },
});

class RoomState {
  constructor() {
    this.players = new Map();
    this.gameStarted = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  getPlayerCount() {
    return this.players.size;
  }

  allPlayersReady() {
    for (const player of this.players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }
}

Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    app.prepare().then(() => {
      const server = http.createServer((req, res) => {
        handle(req, res);
      });

      const io = new Server(server, {
        cors: {
          origin: "*",
        },
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000,
          skipMiddlewares: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        maxHttpBufferSize: 1e8,
        serveClient: false,
        transports: ["websocket"],
        perMessageDeflate: {
          threshold: 1024,
          zlibDeflateOptions: {
            level: 3,
          },
        },
      });

      io.adapter(createAdapter(pubClient, subClient));

      const roomStates = new Map();

      const generateRoomId = () => {
        return `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      };

      const findAvailableRoom = () => {
        for (const [roomId, state] of roomStates) {
          if (state.getPlayerCount() < 2 && !state.gameStarted) {
            return roomId;
          }
        }
        const newRoomId = generateRoomId();
        roomStates.set(newRoomId, new RoomState());
        return newRoomId;
      };

      function broadcastToRoom(socket, roomId, event, data) {
        const room = io.sockets.adapter.rooms.get(roomId);
        if (!room) return;

        const packet = [event, data];
        const sockets = Array.from(room);

        for (let i = 0; i < sockets.length; i++) {
          const socketId = sockets[i];
          if (socketId !== socket.id) {
            io.to(socketId).emit(...packet);
          }
        }
      }

      setInterval(() => {
        const now = Date.now();
        for (const [roomId, state] of roomStates) {
          if (
            (state.getPlayerCount() === 0 && now - state.createdAt > 600000) ||
            now - state.lastActivity > 1800000
          ) {
            roomStates.delete(roomId);
          }
        }
      }, 300000);

      io.on("connection", (socket) => {
        console.log(`New connection: ${socket.id}`);

        // Connection quality monitoring
        let latency = 0;
        let lastPingTime;

        socket.on("ping", () => {
          lastPingTime = Date.now();
          socket.emit("pong");
        });

        socket.on("pong", () => {
          if (lastPingTime) {
            latency = Date.now() - lastPingTime;
            if (latency > 500) {
              socket.emit("reduceQuality");
            }
          }
        });

        const roomId = findAvailableRoom();
        socket.join(roomId);
        const roomState = roomStates.get(roomId);

        socket.emit("roomState", {
          players: Array.from(roomState.players.values()),
          gameStarted: roomState.gameStarted,
        });

        const movementRateLimiter = (data, next) => {
          const now = Date.now();
          const lastMovement = socket.lastMovement || 0;

          if (now - lastMovement < 50) return;

          socket.lastMovement = now;
          next();
        };

        socket.on("joinRoom", (playerName) => {
          if (roomState.players.has(socket.id)) return;

          for (const player of roomState.players.values()) {
            if (player.name === playerName) {
              socket.emit("usernameTaken");
              return;
            }
          }

          roomState.players.set(socket.id, {
            id: socket.id,
            name: playerName,
            isReady: false,
            lastUpdate: Date.now(),
          });

          broadcastToRoom(
            socket,
            roomId,
            "updatePlayers",
            Array.from(roomState.players.values())
          );
        });

        socket.on("playerReady", () => {
          const player = roomState.players.get(socket.id);
          if (player) {
            player.isReady = true;
            player.lastUpdate = Date.now();
            roomState.lastActivity = Date.now();

            broadcastToRoom(
              socket,
              roomId,
              "updatePlayers",
              Array.from(roomState.players.values())
            );

            if (roomState.players.size === 2 && roomState.allPlayersReady()) {
              roomState.gameStarted = true;
              roomState.lastActivity = Date.now();
              io.to(roomId).emit("startGame");
            }
          }
        });

        socket.on("carMove", movementRateLimiter, (data) => {
          roomState.lastActivity = Date.now();
          broadcastToRoom(socket, roomId, "carMove", data);
        });

        socket.on("playerHit", (data) => {
          roomState.lastActivity = Date.now();
          broadcastToRoom(socket, roomId, "playerHit", data);
        });

        socket.on("playerDefeated", (data) => {
          roomState.lastActivity = Date.now();
          io.to(roomId).emit("playerDefeated", data);
        });

        socket.on("restartGame", () => {
          roomState.players.clear();
          roomState.gameStarted = false;
          roomState.lastActivity = Date.now();
          io.to(roomId).emit("restartGame");
        });

        socket.on("playerRestart", (data) => {
          console.log(`Player ${data.playerName} restarted`);
        });

        socket.on("disconnect", () => {
          console.log(`Disconnected: ${socket.id}`);
          if (roomState.players.delete(socket.id)) {
            roomState.lastActivity = Date.now();
            broadcastToRoom(
              socket,
              roomId,
              "updatePlayers",
              Array.from(roomState.players.values())
            );

            if (roomState.gameStarted) {
              io.to(roomId).emit("playerDisconnected", socket.id);
            }
          }
        });

        socket.on("error", (err) => {
          console.error(`Socket error (${socket.id}):`, err);
        });
      });

      pubClient.on("error", (err) => {
        console.error("Redis pub client error:", err);
      });

      subClient.on("error", (err) => {
        console.error("Redis sub client error:", err);
      });

      // Resource monitoring
      setInterval(() => {
        const memoryUsage = process.memoryUsage();
        console.log(`Memory usage: 
          RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB 
          Heap: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}/${Math.round(
          memoryUsage.heapTotal / 1024 / 1024
        )}MB`);

        if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.8) {
          for (const [roomId, state] of roomStates) {
            if (state.getPlayerCount() === 0) {
              roomStates.delete(roomId);
            }
          }
        }
      }, 60000);

      server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
        console.log(`> Using Redis: ${pubClient.options.url}`);
      });
    });
  })
  .catch((err) => {
    console.error("Redis connection failed:", err);
    process.exit(1);
  });
