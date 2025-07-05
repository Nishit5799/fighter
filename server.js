const next = require("next");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Initialize Redis clients with optimized settings
const pubClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 5000), // Exponential backoff with max 5s
  },
});

const subClient = pubClient.duplicate();

// Improved Redis connection handling
const connectRedis = async () => {
  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log("Redis connected successfully");
    return true;
  } catch (err) {
    console.error("Redis connection failed:", err);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    await app.prepare();

    const server = http.createServer((req, res) => {
      handle(req, res);
    });

    const io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: true,
      },
      pingInterval: 10000, // 10 seconds
      pingTimeout: 5000, // 5 seconds
      cookie: false,
      serveClient: false,
    });

    // Use Redis adapter
    io.adapter(
      createAdapter(pubClient, subClient, {
        requestsTimeout: 5000, // Timeout for inter-server requests
      })
    );

    // Object to track room states with weak references
    const roomStates = new Map();

    // Generate unique room IDs more efficiently
    const generateRoomId = () => {
      return `room-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    };

    // Optimized room finding
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

    // More efficient cleanup with batch processing
    const cleanupRooms = () => {
      const now = Date.now();
      const toDelete = [];

      for (const [roomId, state] of roomStates) {
        if (state.players.size === 0 && now - state.createdAt > 3600000) {
          toDelete.push(roomId);
        }
      }

      toDelete.forEach((roomId) => {
        roomStates.delete(roomId);
        console.log(`Cleaned up empty room: ${roomId}`);
      });
    };

    const cleanupInterval = setInterval(cleanupRooms, 60000);

    // Socket connection handling
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

      // Event handlers
      const handleJoinRoom = (playerName) => {
        if (roomState.players.has(socket.id)) return;

        // Check for duplicate names
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
      };

      const handlePlayerReady = () => {
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
      };

      // Game event handlers
      const handleCarMove = (data) => {
        socket.to(roomId).emit("carMove", data);
      };

      const broadcastToRoom = (event, data) => {
        io.to(roomId).emit(event, data);
      };

      // Register event listeners
      socket.on("joinRoom", handleJoinRoom);
      socket.on("playerReady", handlePlayerReady);
      socket.on("carMove", handleCarMove);
      socket.on("playerHit", (data) => broadcastToRoom("playerHit", data));
      socket.on("playerDefeated", (data) =>
        broadcastToRoom("playerDefeated", data)
      );
      socket.on("restartGame", () => {
        roomState.players.clear();
        roomState.gameStarted = false;
        broadcastToRoom("restartGame");
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

    // Error handling
    pubClient.on("error", (err) => {
      console.error("Redis pub client error:", err);
    });

    subClient.on("error", (err) => {
      console.error("Redis sub client error:", err);
    });

    server.on("error", (err) => {
      console.error("Server error:", err);
    });

    server.listen(PORT, () => {
      console.log(`> Ready on http://localhost:${PORT}`);
      console.log(`> Using Redis: ${pubClient.options.url}`);
    });

    // Cleanup on exit
    process.on("SIGTERM", () => {
      clearInterval(cleanupInterval);
      server.close();
      pubClient.quit();
      subClient.quit();
    });
  } catch (err) {
    console.error("Server startup failed:", err);
    process.exit(1);
  }
};

// Start the application
connectRedis().then(startServer);
