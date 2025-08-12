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

      const HIT_RANGE = 1.15; // world units; tune 1.3–1.7 to match your models
      const CONTACT_GRACE_MS = 180; // allow very recent contact to count

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
          // kept for potential future use, but no longer used to filter hits
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
            lastPos: null, // { x, y, z }
            lastContactAt: 0, // ms timestamp
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
          // Store attacker’s last position/contact for validation
          const player = roomState.players.get(socket.id);
          if (player) {
            if (data?.position) player.lastPos = data.position;
            if (typeof data?.isInContact === "boolean") {
              if (data.isInContact) player.lastContactAt = Date.now();
            }
          }
          socket.to(roomId).emit("carMove", data);
        });

        socket.on("contactState", ({ inContact, at }) => {
          const player = roomState.players.get(socket.id);
          if (!player) return;
          if (inContact) {
            player.lastContactAt = at || Date.now();
          }
        });

        // 🔧 Always forward hits; don't filter by client clocks
        socket.on("playerHit", (data) => {
          const serverTime = Date.now();
          const players = Array.from(roomState.players.keys());
          const victimId = players.find((id) => id !== socket.id);
          if (!victimId) return;

          const attacker = roomState.players.get(socket.id);
          const victim = roomState.players.get(victimId);

          // Require positional info to exist
          let inRange = false;
          if (attacker?.lastPos && victim?.lastPos) {
            const dx = attacker.lastPos.x - victim.lastPos.x;
            const dy = attacker.lastPos.y - victim.lastPos.y;
            const dz = attacker.lastPos.z - victim.lastPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            inRange = distSq <= HIT_RANGE * HIT_RANGE;
          }

          // Grace period: very recent sensor contact on either player
          const recentContact =
            (attacker &&
              serverTime - attacker.lastContactAt <= CONTACT_GRACE_MS) ||
            (victim && serverTime - victim.lastContactAt <= CONTACT_GRACE_MS);

          // 🚫 Block out-of-range + no recent contact
          if (!inRange && !recentContact) {
            return;
          }

          const hitData = {
            ...data,
            victimId,
            attackTime: data.attackTime ?? serverTime,
            serverTime,
          };

          socket.to(victimId).emit("playerHit", hitData);
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

          io.to(roomId).emit("playerDefeated", defeatData);
          console.log(`Verified Match Result - 
    Winner: ${winner.name} (${winner.id}), 
    Loser: ${loser.name} (${loser.id})`);

          socket.on("restartGame", () => {
            roomState.matchResult = null;
            roomState.players.forEach((player) => (player.isReady = false));
            roomState.gameStarted = false;
            io.to(roomId).emit("restartGame");
          });
        });

        socket.on("restartGame", () => {
          roomState.players.clear();
          roomState.gameStarted = false;
          roomState.matchResult = null;
          roomState.lastAttacks = {};
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
