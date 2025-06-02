"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [enemyState, setEnemyState] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    animation: "idle",
  });

  useEffect(() => {
    const socketInstance = io(
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001",
      {
        withCredentials: true,
        autoConnect: false,
      }
    );

    // Connection events
    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to socket server");
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from socket server");
    });

    // Room events
    socketInstance.on("roomJoined", (data) => {
      setRoomId(data.roomId);
      setPlayers(data.players);
    });

    socketInstance.on("playerJoined", (data) => {
      setPlayers((prev) => [
        ...prev,
        {
          id: data.playerId,
          username: data.username,
          isReady: false,
        },
      ]);
    });

    socketInstance.on("playerReady", (data) => {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === data.playerId ? { ...player, isReady: true } : player
        )
      );
    });

    socketInstance.on("startGame", () => {
      console.log("Game started!");
    });

    // Game state events
    socketInstance.on("playerMovement", (data) => {
      setEnemyState((prev) => ({
        ...prev,
        position: data.position,
        rotation: data.rotation,
      }));
    });

    socketInstance.on("playerAttack", (data) => {
      setEnemyState((prev) => ({
        ...prev,
        animation: data.attackType,
      }));
    });

    socketInstance.on("playerLeft", () => {
      alert("Opponent disconnected");
      setRoomId(null);
      setPlayers([]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const value = {
    socket,
    isConnected,
    roomId,
    players,
    enemyState,
    connect: () => socket?.connect(),
    disconnect: () => socket?.disconnect(),
    joinRoom: (username) => socket?.emit("joinRoom", { username }),
    playerReady: () => socket?.emit("playerReady", { roomId }),
    sendMovement: (position, rotation) => {
      if (socket && roomId) {
        socket.emit("playerMovement", { roomId, position, rotation });
      }
    },
    sendAttack: (attackType) => {
      if (socket && roomId) {
        socket.emit("playerAttack", { roomId, attackType });
      }
    },
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
