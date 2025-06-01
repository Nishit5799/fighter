// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const PORT = process.env.PORT || 3001;

const rooms = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", async ({ username }) => {
    // Find or create a room with available space
    let roomFound = false;
    for (const roomId in rooms) {
      if (rooms[roomId].players.length < 2) {
        roomFound = true;
        socket.join(roomId);
        rooms[roomId].players.push({ id: socket.id, username, ready: false });
        socket.emit("roomJoined", { roomId, players: rooms[roomId].players });
        io.to(roomId).emit("playerJoined", rooms[roomId].players);
        break;
      }
    }

    if (!roomFound) {
      const newRoomId = `room_${Date.now()}`;
      socket.join(newRoomId);
      rooms[newRoomId] = {
        players: [{ id: socket.id, username, ready: false }],
      };
      socket.emit("roomJoined", {
        roomId: newRoomId,
        players: rooms[newRoomId].players,
      });
    }
  });

  socket.on("playerReady", async ({ roomId }) => {
    if (rooms[roomId]) {
      const playerIndex = rooms[roomId].players.findIndex(
        (p) => p.id === socket.id
      );
      if (playerIndex !== -1) {
        rooms[roomId].players[playerIndex].ready = true;
        io.to(roomId).emit("playerReady", rooms[roomId].players);

        // Check if all players are ready
        if (
          rooms[roomId].players.length === 2 &&
          rooms[roomId].players.every((p) => p.ready)
        ) {
          io.to(roomId).emit("startGame");
        }
      }
    }
  });

  socket.on("playerMovement", ({ roomId, position, rotation }) => {
    socket.to(roomId).emit("opponentMovement", { position, rotation });
  });

  socket.on("playerAction", ({ roomId, action }) => {
    socket.to(roomId).emit("opponentAction", { action });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // Clean up rooms
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (p) => p.id !== socket.id
      );
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("playerLeft", rooms[roomId].players);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
