require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Redis setup
const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

// Socket.io setup with Redis adapter
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

// Game state management
class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(roomId) {
    this.rooms.set(roomId, {
      players: new Map(),
      readyPlayers: new Set(),
      gameStarted: false,
    });
    return this.rooms.get(roomId);
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  joinRoom(socket, roomId, username) {
    let room = this.getRoom(roomId) || this.createRoom(roomId);

    room.players.set(socket.id, {
      username,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      animation: "idle",
    });

    return room;
  }

  cleanupRoom(roomId) {
    const room = this.getRoom(roomId);
    if (room && room.players.size === 0) {
      this.rooms.delete(roomId);
    }
  }
}

const roomManager = new RoomManager();

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Room management
  socket.on("joinRoom", async ({ username }) => {
    try {
      // Find or create a suitable room
      let roomToJoin = null;
      for (const [roomId, room] of roomManager.rooms) {
        if (room.players.size < 2 && !room.gameStarted) {
          roomToJoin = roomId;
          break;
        }
      }

      if (!roomToJoin) {
        roomToJoin = `room_${Date.now()}`;
      }

      const room = roomManager.joinRoom(socket, roomToJoin, username);
      await socket.join(roomToJoin);

      // Prepare player list response
      const players = Array.from(room.players.entries()).map(
        ([id, player]) => ({
          id,
          username: player.username,
          isReady: room.readyPlayers.has(id),
        })
      );

      // Notify the joining player
      socket.emit("roomJoined", {
        roomId: roomToJoin,
        players,
        isGameMaster: room.players.size === 1,
      });

      // Notify other players in the room
      socket.to(roomToJoin).emit("playerJoined", {
        playerId: socket.id,
        username,
      });
    } catch (error) {
      console.error("Room join error:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Game readiness
  socket.on("playerReady", ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    room.readyPlayers.add(socket.id);
    socket.to(roomId).emit("playerReady", { playerId: socket.id });

    // Start game if all players are ready
    if (room.readyPlayers.size === 2) {
      room.gameStarted = true;
      io.to(roomId).emit("startGame");
      console.log(`Game started in room ${roomId}`);
    }
  });

  // Gameplay events
  socket.on("playerMovement", ({ roomId, position, rotation }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.gameStarted) return;

    // Update player state
    if (room.players.has(socket.id)) {
      room.players.get(socket.id).position = position;
      room.players.get(socket.id).rotation = rotation;
    }

    // Broadcast to other players
    socket.to(roomId).emit("playerMovement", {
      playerId: socket.id,
      position,
      rotation,
    });
  });

  socket.on("playerAttack", ({ roomId, attackType }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.gameStarted) return;

    // Update player state
    if (room.players.has(socket.id)) {
      room.players.get(socket.id).animation = attackType;
    }

    // Broadcast to other players
    socket.to(roomId).emit("playerAttack", {
      playerId: socket.id,
      attackType,
    });
  });

  // Disconnection handling
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Find and clean up rooms
    for (const [roomId, room] of roomManager.rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        room.readyPlayers.delete(socket.id);

        // Notify remaining player
        socket.to(roomId).emit("playerLeft");

        // Clean up empty rooms
        roomManager.cleanupRoom(roomId);
        break;
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Fight Arena server running on port ${PORT}`);
});
