const next = require("next");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Initialize Redis clients
const pubClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

const subClient = pubClient.duplicate();

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
        pingInterval: 20000,
        pingTimeout: 10000,
        maxHttpBufferSize: 1e6,
        transports: ["websocket"],
        serveClient: false,
        allowEIO3: true,
        perMessageDeflate: {
          threshold: 1024,
        },
        wsEngine: "ws",
      });

      // Use Redis adapter
      io.adapter(createAdapter(pubClient, subClient));

      // Object to track room states
      const roomStates = new Map();

      // Generate unique room IDs
      const generateRoomId = () => {
        return `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      };

      // Find or create available room
      const findAvailableRoom = () => {
        for (const [roomId, state] of roomStates) {
          if (state.players.size < 2 && !state.gameStarted) {
            return roomId;
          }
        }
        const newRoomId = generateRoomId();
        roomStates.set(newRoomId, {
          players: new Map(),
          gameStarted: false,
          createdAt: Date.now(),
        });
        return newRoomId;
      };

      // Cleanup empty rooms periodically
      setInterval(() => {
        const now = Date.now();
        for (const [roomId, state] of roomStates) {
          if (state.players.size === 0 && now - state.createdAt > 3600000) {
            roomStates.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
          }
        }
      }, 60000);

      // Rate limiting middleware
      io.use((socket, next) => {
        const now = Date.now();
        const lastEvent = socket._lastEvent || 0;
        const delay = now - lastEvent;

        if (delay < 50) {
          return next(new Error("Too many messages"));
        }

        socket._lastEvent = now;
        next();
      });

      io.on("connection", (socket) => {
        console.log(`New connection: ${socket.id}`);

        // Assign to room
        const roomId = findAvailableRoom();
        socket.join(roomId);
        const roomState = roomStates.get(roomId);

        // Send current room state to new player
        socket.emit("roomState", {
          players: Array.from(roomState.players.values()),
          gameStarted: roomState.gameStarted,
        });

        // Handle player joining
        socket.on("joinRoom", (playerName) => {
          if (roomState.players.has(socket.id)) return;

          // Check if name is taken
          for (const player of roomState.players.values()) {
            if (player.name === playerName) {
              socket.emit("usernameTaken");
              return;
            }
          }

          // Add player to room
          roomState.players.set(socket.id, {
            id: socket.id,
            name: playerName,
            isReady: false,
          });

          io.to(roomId).emit(
            "updatePlayers",
            Array.from(roomState.players.values())
          );
        });

        // Handle player ready status
        socket.on("playerReady", () => {
          const player = roomState.players.get(socket.id);
          if (player) {
            player.isReady = true;
            io.to(roomId).emit(
              "updatePlayers",
              Array.from(roomState.players.values())
            );

            if (
              roomState.players.size === 2 &&
              Array.from(roomState.players.values()).every((p) => p.isReady)
            ) {
              roomState.gameStarted = true;
              io.to(roomId).emit("startGame");
            }
          }
        });

        // Handle game movements with timestamp
        socket.on("carMove", (data) => {
          socket
            .to(roomId)
            .compress(false)
            .volatile.emit("carMove", {
              ...data,
              timestamp: Date.now(),
            });
        });

        socket.on("playerHit", (data) => {
          io.to(roomId).volatile.emit("playerHit", data);
        });

        socket.on("playerDefeated", (data) => {
          io.to(roomId).emit("playerDefeated", data);
        });

        // Handle game restarts
        socket.on("restartGame", () => {
          roomState.players.clear();
          roomState.gameStarted = false;
          io.to(roomId).emit("restartGame");
        });

        socket.on("playerRestart", (data) => {
          console.log(`Player ${data.playerName} (${data.playerId}) restarted`);
        });

        // Handle latency updates
        socket.on("latencyUpdate", (latency) => {
          socket.data.latency = latency;
        });

        // Handle ping
        socket.on("ping", (callback) => {
          callback();
        });

        // Handle disconnections
        socket.on("disconnect", () => {
          console.log(`Disconnected: ${socket.id}`);
          if (roomState.players.delete(socket.id)) {
            io.to(roomId).emit(
              "updatePlayers",
              Array.from(roomState.players.values())
            );

            if (roomState.gameStarted) {
              io.to(roomId).emit("playerDisconnected", socket.id);
            }
          }
        });

        // Error handling
        socket.on("error", (err) => {
          console.error(`Socket error (${socket.id}):`, err);
        });
      });

      // Handle Redis client errors
      pubClient.on("error", (err) => {
        console.error("Redis pub client error:", err);
      });

      subClient.on("error", (err) => {
        console.error("Redis sub client error:", err);
      });

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
