// src/context/SocketContext.js
"use client";
import { createContext, useContext } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const socket = io(
    process.env.NEXT_PUBLIC_SOCKET_SERVER || "http://localhost:3001"
  );

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
