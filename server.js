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
        });
        return newRoomId;
      };

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
          socket.broadcast.emit("updateHealth", data);
        });
        socket.on("playerDefeated", (data) => {
          console.log(`Received defeat event - 
            Winner: ${data.winnerId}, 
            Loser: ${data.loserId},
            WinnerHealth: ${data.winnerHealth},
            LoserHealth: ${data.loserHealth}`);

          if (!data || typeof data !== "object") {
            console.error("Invalid data format");
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

          const defeatData = {
            winnerId: data.winnerId,
            loserId: data.loserId,
            winnerHealth: Math.max(1, Math.min(100, data.winnerHealth || 100)),
            loserHealth: 0,
            winningAttackTime: data.winningAttackTime || Date.now(),
          };

          io.to(roomId).emit("playerDefeated", defeatData);
          console.log(`Verified Match Result - 
            Winner: ${winner.name} (${winner.id}), 
            Loser: ${loser.name} (${loser.id})`);
        });

        socket.on("restartGame", () => {
          roomState.players.clear();
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
