const next = require("next");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Initialize Redis clients with retry strategy
const pubClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) {
        console.log("Too many retries on Redis. Connection terminated");
        return new Error("Too many retries");
      }
      return Math.min(retries * 100, 5000);
    },
  },
});

const subClient = pubClient.duplicate();

// Handle Redis connection errors
pubClient.on("error", (err) => {
  console.error("Redis pub client error:", err);
});

subClient.on("error", (err) => {
  console.error("Redis sub client error:", err);
});

Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    app.prepare().then(() => {
      const server = http.createServer((req, res) => {
        handle(req, res);
      });

      const io = new Server(server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
        },
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000,
          skipMiddlewares: true,
        },
        pingInterval: 10000,
        pingTimeout: 5000,
        maxHttpBufferSize: 1e8,
        serveClient: false,
      });

      io.adapter(createAdapter(pubClient, subClient));
      const roomStates = new Map();

      const generateRoomId = () => {
        return `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      };

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
          matchResult: null,
        });
        return newRoomId;
      };

      // Clean up empty rooms periodically
      setInterval(() => {
        const now = Date.now();
        for (const [roomId, state] of roomStates) {
          if (state.players.size === 0 && now - state.createdAt > 3600000) {
            roomStates.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
          }
        }
      }, 60000);

      io.on("connection", (socket) => {
        console.log(`New connection: ${socket.id}`);

        const roomId = findAvailableRoom();
        socket.join(roomId);
        const roomState = roomStates.get(roomId);

        socket.emit("roomState", {
          players: Array.from(roomState.players.values()),
          gameStarted: roomState.gameStarted,
        });

        socket.on("joinRoom", (playerName) => {
          if (roomState.players.has(socket.id)) return;

          // Check for duplicate names
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
          });

          io.to(roomId).emit(
            "updatePlayers",
            Array.from(roomState.players.values())
          );
        });

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

        socket.on("carMove", (data) => {
          socket.to(roomId).emit("carMove", data);
        });

        socket.on("playerHit", (data) => {
          const hitData = {
            ...data,
            attackTime: data.attackTime || Date.now(),
          };
          socket.to(roomId).emit("playerHit", hitData);
        });

        socket.on("updateHealth", (data) => {
          socket.to(roomId).emit("updateHealth", data);
        });

        socket.on("playerDefeated", (data) => {
          if (!roomState.gameStarted || !roomState.players) {
            console.error("Game not started or room not found");
            return;
          }

          if (
            !data ||
            typeof data !== "object" ||
            !data.winnerId ||
            !data.loserId
          ) {
            console.error("Invalid data format", data);
            return;
          }

          if (data.winnerId === data.loserId) {
            console.error(`Duplicate IDs: ${data.winnerId}`);
            return;
          }

          const winner = roomState.players.get(data.winnerId);
          const loser = roomState.players.get(data.loserId);

          if (!winner || !loser) {
            console.error(
              "Invalid playerDefeated data - winner or loser not found"
            );
            return;
          }

          if (roomState.matchResult) {
            console.log(
              "Match result already processed, ignoring duplicate event"
            );
            return;
          }

          roomState.matchResult = {
            winnerId: data.winnerId,
            loserId: data.loserId,
          };

          const defeatData = {
            winnerId: data.winnerId,
            loserId: data.loserId,
            winnerHealth: Math.max(1, Math.min(100, data.winnerHealth || 100)),
            loserHealth: 0,
            winningAttackTime: data.winningAttackTime || Date.now(),
          };

          io.to(roomId).emit("playerDefeated", defeatData);
          console.log(
            `Verified Match Result - Winner: ${winner.name} (${winner.id}), Loser: ${loser.name} (${loser.id})`
          );
        });

        socket.on("restartGame", () => {
          roomState.matchResult = null;
          roomState.players.forEach((player) => (player.isReady = false));
          roomState.gameStarted = false;
          io.to(roomId).emit("restartGame");
        });

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
      });

      server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
      });
    });
  })
  .catch((err) => {
    console.error("Redis connection failed:", err);
    process.exit(1);
  });
