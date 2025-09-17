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
        pingTimeout: 60000,
        pingInterval: 10000,
      });

      io.adapter(createAdapter(pubClient, subClient));
      const roomStates = new Map();

      const generateRoomId = () => {
        return `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      };

      const findAvailableRoom = () => {
        for (const [roomId, state] of rooms.entries()) {
          const joinedPlayers = Array.from(state.players.values()).filter(
            (p) => !!p.name
          );
          if (joinedPlayers.length < 2 && !state.gameStarted) {
            return roomId;
          }
        }

        const newRoomId = nanoid(6);
        rooms.set(newRoomId, {
          players: new Map(),
          gameStarted: false,
          createdAt: Date.now(),
          lastAttacks: {},
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

          // Clear old attack times (legacy; harmless to keep)
          if (state.lastAttacks) {
            for (const [playerId, time] of Object.entries(state.lastAttacks)) {
              if (now - time > 5000) {
                delete state.lastAttacks[playerId];
              }
            }
          }
        }
      }, 60000);

      io.on("connection", (socket) => {
        console.log(`New connection: ${socket.id}`);

        socket.on("connection_quality", (quality) => {
          if (quality === "low") {
            socket._lowQualityMode = true;
          }
        });

        const roomId = findAvailableRoom();
        socket.join(roomId);
        const rooms = new Map();

        const roomState = rooms.get(roomId);

        socket.emit("roomState", {
          roomId, // ✅ NEW!
          players: Array.from(roomState.players.values()),
          gameStarted: roomState.gameStarted,
        });

        socket.on("joinRoom", (playerName) => {
          if (roomState.players.size >= 2) {
            // Redirect to another room
            const newRoomId = findAvailableRoom();
            socket.leave(roomId);
            socket.join(newRoomId);

            const newState = rooms.get(newRoomId);
            newState.players.set(socket.id, {
              id: socket.id,
              name: playerName,
              isReady: false,
            });

            io.to(newRoomId).emit(
              "updatePlayers",
              Array.from(newState.players.values())
            );
            socket.emit("roomState", {
              roomId: newRoomId,
              players: Array.from(newState.players.values()),
              gameStarted: newState.gameStarted,
            });

            return;
          }

          // Normal join flow
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
              io.to(roomId).emit("startGame", { roomId }); // ✅ include roomId
            }
          }
        });

        socket.on("carMove", (data) => {
          socket.to(roomId).emit("carMove", data);
        });

        // 🔧 Always forward hits; don't filter by client clocks
        socket.on("playerHit", (data) => {
          const serverTime = Date.now();
          const players = Array.from(roomState.players.keys());
          const otherPlayerId = players.find((id) => id !== socket.id);

          const hitData = {
            ...data,
            victimId: otherPlayerId, // ✅ NEW — send who should take the hit
            attackTime: data.attackTime ?? serverTime,
            serverTime,
          };

          if (otherPlayerId) {
            io.to(otherPlayerId).emit("playerHit", hitData);
          }
          socket.emit("playerHit", hitData); // also send back to attacker

          roomState.lastAttacks[socket.id] = serverTime;
        });

        socket.on("updateHealth", (data) => {
          socket.broadcast.emit("updateHealth", data);
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

          for (const [id] of roomState.players.entries()) {
            io.to(id).emit("playerDefeated", defeatData);
          }

          console.log(`Verified Match Result - 
    Winner: ${winner.name} (${winner.id}), 
    Loser: ${loser.name} (${loser.id})`);

          socket.on("restartGame", () => {
            roomState.matchResult = null;
            roomState.players.forEach((player) => (player.isReady = false));
            roomState.gameStarted = false;
            for (const [id] of roomState.players.entries()) {
              io.to(id).emit("restartGame");
            }
          });
        });

        socket.on("restartGame", () => {
          // Emit to joined players *before* clearing them
          for (const [id] of roomState.players.entries()) {
            io.to(id).emit("restartGame");
          }

          roomState.players.clear(); // ✅ clear after emitting
          roomState.gameStarted = false;
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
