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
        // Enable connection state recovery
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
          skipMiddlewares: true,
        },
      });

      // Use Redis adapter
      io.adapter(createAdapter(pubClient, subClient));

      // Object to track room states (in-memory, Redis could be used for persistence if needed)
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
        // Create new room if none available
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
            // 1 hour
            roomStates.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
          }
        }
      }, 60000); // Run every minute

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
          if (roomState.players.has(socket.id)) {
            return; // Already joined
          }

          // Check if name is taken in this room
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

          // Broadcast updated player list
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

            // Start game if all ready
            if (
              roomState.players.size === 2 &&
              Array.from(roomState.players.values()).every((p) => p.isReady)
            ) {
              roomState.gameStarted = true;
              io.to(roomId).emit("startGame");
            }
          }
        });

        // Handle game movements
        socket.on("carMove", (data) => {
          socket.to(roomId).emit("carMove", data);
        });

        // Handle game restarts
        socket.on("restartGame", () => {
          roomState.players.clear();
          roomState.gameStarted = false;
          io.to(roomId).emit("restartGame");
        });

        socket.on("playerRestart", (data) => {
          console.log(
            `Player ${data.playerName} (${data.playerId}) restarted their game`
          );
        });
        // Handle disconnections
        socket.on("disconnect", () => {
          console.log(`Disconnected: ${socket.id}`);
          if (roomState.players.delete(socket.id)) {
            io.to(roomId).emit(
              "updatePlayers",
              Array.from(roomState.players.values())
            );

            // Notify if game was in progress
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
