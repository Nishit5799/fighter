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
      const server = http.createServer((req, res) => handle(req, res));

      const io = new Server(server, {
        cors: { origin: "*" },
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000,
          skipMiddlewares: true,
        },
        pingTimeout: 60000,
        pingInterval: 10000,
      });

      io.adapter(createAdapter(pubClient, subClient));

      // ---- In-memory room state ----
      const roomStates = new Map();

      const generateRoomId = () =>
        `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const findAvailableRoom = () => {
        for (const [roomId, state] of roomStates) {
          if (state.players.size < 2 && !state.gameStarted) return roomId;
        }
        const newRoomId = generateRoomId();
        roomStates.set(newRoomId, {
          players: new Map(), // socketId -> { id, name, isReady, pose }
          gameStarted: false,
          createdAt: Date.now(),
          lastAttacks: {},
        });
        return newRoomId;
      };

      // Clean up stale rooms
      setInterval(() => {
        const now = Date.now();
        for (const [roomId, state] of roomStates) {
          if (state.players.size === 0 && now - state.createdAt > 3600000) {
            roomStates.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
          }
          if (state.lastAttacks) {
            for (const [pid, t] of Object.entries(state.lastAttacks)) {
              if (now - t > 5000) delete state.lastAttacks[pid];
            }
          }
        }
      }, 60000);

      // ---- Authoritative snapshots (20 ticks/sec) ----
      const TICK_MS = 50;
      setInterval(() => {
        for (const [roomId, state] of roomStates) {
          if (state.players.size === 0) continue;
          const snapshot = {
            t: Date.now(),
            players: Array.from(state.players.values()).map((p) => ({
              id: p.id,
              name: p.name,
              isReady: !!p.isReady,
              pose: p.pose || {
                position: { x: 0, y: 0, z: 0 },
                rotationY: 0,
                animation: "idle",
                isAttacking: false,
                isHit: false,
                health: 100,
              },
            })),
          };
          io.to(roomId).emit("stateUpdate", snapshot);
        }
      }, TICK_MS);

      io.on("connection", (socket) => {
        console.log(`New connection: ${socket.id}`);

        socket.on("connection_quality", (quality) => {
          socket._lowQualityMode = quality === "low";
        });

        // Join/create room
        const roomId = findAvailableRoom();
        socket.join(roomId);
        const roomState = roomStates.get(roomId);

        // Send initial state
        socket.emit("roomState", {
          players: Array.from(roomState.players.values()),
          gameStarted: roomState.gameStarted,
        });

        // Lobby & start
        socket.on("joinRoom", (playerName) => {
          if (roomState.players.has(socket.id)) return;

          // Unique name per room
          for (const p of roomState.players.values()) {
            if (p.name === playerName) {
              socket.emit("usernameTaken");
              return;
            }
          }

          roomState.players.set(socket.id, {
            id: socket.id,
            name: playerName,
            isReady: false,
            pose: {
              position: { x: 0, y: 0, z: 0 },
              rotationY: 0,
              animation: "idle",
              isAttacking: false,
              isHit: false,
              health: 100,
            },
          });

          io.to(roomId).emit(
            "updatePlayers",
            Array.from(roomState.players.values())
          );
        });

        socket.on("playerReady", () => {
          const p = roomState.players.get(socket.id);
          if (!p) return;
          p.isReady = true;

          io.to(roomId).emit(
            "updatePlayers",
            Array.from(roomState.players.values())
          );

          const allReady =
            roomState.players.size === 2 &&
            Array.from(roomState.players.values()).every((x) => x.isReady);

          if (allReady && !roomState.gameStarted) {
            roomState.gameStarted = true;
            io.to(roomId).emit("startGame");
          }
        });

        // ---- Client movement -> server state (authoritative broadcast) ----
        // Clients can send frequently; server stores latest & broadcasts on tick
        socket.on("carMove", (data) => {
          const p = roomState.players.get(socket.id);
          if (!p) return;

          // Minimal validation/sanitization to avoid crazy values
          const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
          const pos = data?.position || { x: 0, y: 0, z: 0 };

          p.pose = {
            position: {
              x: clamp(pos.x ?? 0, -50, 50),
              y: clamp(pos.y ?? 0, -1, 10),
              z: clamp(pos.z ?? 0, -50, 50),
            },
            rotationY: Number.isFinite(data?.rotation) ? data.rotation : 0,
            animation: data?.animation || "idle",
            isAttacking: !!data?.isAttacking,
            isHit: !!data?.isHit,
            health: Number.isFinite(data?.health) ? data.health : 100,
          };

          // Optional: acknowledge latest input sequence for reconciliation
          if (Number.isFinite(data?.seq)) {
            socket.emit("inputAck", { seq: data.seq });
          }
        });

        // ---- Combat: always forward; server is arbiter of result message ----
        socket.on("playerHit", (data) => {
          const serverTime = Date.now();
          const ids = Array.from(roomState.players.keys());
          const otherId = ids.find((id) => id !== socket.id);

          const hitData = {
            ...data,
            victimId: otherId,
            attackTime: data.attackTime ?? serverTime,
            serverTime,
          };

          if (otherId) {
            socket.to(otherId).emit("playerHit", hitData);
          }
          roomState.lastAttacks[socket.id] = serverTime;
        });

        socket.on("updateHealth", (data) => {
          // Mirror to room; clients still display via snapshots
          socket.broadcast.to(roomId).emit("updateHealth", data);
          // Also stamp into server pose if available
          for (const p of roomState.players.values()) {
            if (p.id === Array.from(roomState.players.keys())[0]) {
              p.pose.health = data.health1;
            } else {
              p.pose.health = data.health2;
            }
          }
        });

        socket.on("playerDefeated", (data) => {
          if (!roomState.gameStarted || !roomState.players) return;

          if (
            !data ||
            typeof data !== "object" ||
            !data.winnerId ||
            !data.loserId
          ) {
            console.error("Invalid data format", data);
            return;
          }
          if (data.winnerId === data.loserId) return;

          const winner = roomState.players.get(data.winnerId);
          const loser = roomState.players.get(data.loserId);
          if (!winner || !loser) return;

          if (roomState.matchResult) return;

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

          // Update poses for snapshot consistency
          winner.pose.health = defeatData.winnerHealth;
          loser.pose.health = 0;

          io.to(roomId).emit("playerDefeated", defeatData);

          socket.on("restartGame", () => {
            roomState.matchResult = null;
            roomState.players.forEach((pl) => (pl.isReady = false));
            roomState.gameStarted = false;
            io.to(roomId).emit("restartGame");
          });
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
