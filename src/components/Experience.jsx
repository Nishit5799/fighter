// src/components/Experience.jsx
"use client";
import {
  KeyboardControls,
  OrthographicCamera,
  Environment,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import gsap from "gsap";
import Link from "next/link";
import { useSocket } from "../context/SocketContext";

import PlayerController from "./PlayerController";
import OpponentController from "./OpponentController";
import Joystick from "./Joystick";
import AttackButtons from "./AttackButtons";
import Arena from "./Arena";
import Info from "./Info";

const keyboardMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "punch", keys: ["KeyJ"] },
  { name: "kick", keys: ["KeyK"] },
  { name: "run", keys: ["Shift"] },
];

const Experience = () => {
  const socket = useSocket();
  const [joystickDirection, setJoystickDirection] = useState({ x: 0, y: 0 });
  const [punchPressed, setPunchPressed] = useState(false);
  const [kickPressed, setKickPressed] = useState(false);

  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [username, setUsername] = useState("");
  const [showLobby, setShowLobby] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [opponentPosition, setOpponentPosition] = useState([0, 0, 0]);
  const [opponentRotation, setOpponentRotation] = useState(0);
  const [opponentAnimation, setOpponentAnimation] = useState("idle");

  const playerControllerRef = useRef();
  const welcomeTextRef = useRef();

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    socket.on("roomJoined", ({ roomId, players }) => {
      setRoomId(roomId);
      setPlayers(players);
      setShowLobby(true);
    });

    socket.on("playerJoined", (players) => {
      setPlayers(players);
    });

    socket.on("playerReady", (players) => {
      setPlayers(players);
    });

    socket.on("startGame", () => {
      setIsReady(true);
      setTimeout(() => {
        setShowWelcomeScreen(false);
        setIsGameStarted(true);
        // Hide the lobby after game starts
        setTimeout(() => setShowLobby(false), 500);
      }, 1000);
    });

    socket.on("opponentMovement", ({ position, rotation }) => {
      setOpponentPosition(position);
      setOpponentRotation(rotation);
    });

    socket.on("opponentAction", ({ action }) => {
      setOpponentAnimation(action);
    });

    socket.on("playerLeft", (players) => {
      setPlayers(players);
      if (players.length < 2) {
        // Handle opponent disconnection
      }
    });

    return () => {
      socket.off("roomJoined");
      socket.off("playerJoined");
      socket.off("playerReady");
      socket.off("startGame");
      socket.off("opponentMovement");
      socket.off("opponentAction");
      socket.off("playerLeft");
    };
  }, [socket]);

  // Welcome screen animation
  useEffect(() => {
    if (showWelcomeScreen) {
      const letters = Array.from(welcomeTextRef.current.children);
      gsap.fromTo(
        letters,
        { y: -10 },
        {
          y: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: "ease.in",
          repeat: -1,
          repeatDelay: 0.5,
          yoyo: true,
        }
      );
    }
  }, [showWelcomeScreen]);

  const handleJoinRoom = useCallback(() => {
    if (username.trim() !== "" && socket) {
      socket.emit("joinRoom", { username });
    }
  }, [username, socket]);

  const handleReady = useCallback(() => {
    if (socket && roomId) {
      socket.emit("playerReady", { roomId });
      setIsReady(true);
    }
  }, [socket, roomId]);

  const handlePlayerUpdate = useCallback(
    (position, rotation) => {
      if (socket && roomId) {
        socket.emit("playerMovement", { roomId, position, rotation });
      }
    },
    [socket, roomId]
  );

  const handlePlayerAction = useCallback(
    (action) => {
      if (socket && roomId) {
        socket.emit("playerAction", { roomId, action });
      }
    },
    [socket, roomId]
  );

  const memoizedKeyboardMap = useMemo(() => keyboardMap, []);

  return (
    <>
      {showWelcomeScreen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-50 start">
          <div className="text-center">
            <div
              ref={welcomeTextRef}
              className="font-choco tracking-wider text-5xl font-bold text-yellow-400 mb-8 flex"
            >
              {"Fight Arena".split("").map((letter, index) => (
                <span key={index} className="inline-block">
                  {letter === " " ? "\u00A0" : letter}
                </span>
              ))}
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="px-4 py-2 rounded-lg bg-white text-black font-choco text-xl w-64 text-center"
              />
            </div>

            <div
              onClick={handleJoinRoom}
              className="mt-4 py-2 font-choco text-white sm:text-2xl text-3xl tracking-widest cursor-pointer bg-green-500 hover:bg-green-600 sm:w-[65%] w-[75%] h-[30%] mx-auto rounded-lg transition-colors"
            >
              JOIN ROOM
            </div>
            <div
              onClick={() => setShowInfoPopup(true)}
              className="mt-4 py-2 font-choco text-white sm:text-2xl text-3xl tracking-widest cursor-pointer bg-blue-500 hover:bg-blue-600 sm:w-[80%] w-[90%] h-[30%] mx-auto rounded-lg transition-colors"
            >
              HOW TO PLAY?
            </div>
            <Link href="/" className="block mt-4">
              <div className="py-2 font-choco text-white sm:text-2xl text-3xl tracking-widest cursor-pointer bg-red-500 hover:bg-red-600 sm:w-[40%] w-[50%] h-[30%] mx-auto rounded-lg transition-colors">
                EXIT
              </div>
            </Link>
          </div>
        </div>
      )}

      {showLobby && (
        <div className="fixed bottom-4 right-4 bg-gray-800 bg-opacity-80 p-4 rounded-lg z-50">
          <h2 className="text-white font-choco text-xl mb-2 border-b border-gray-600 pb-2">
            LOBBY ({players.length}/2)
          </h2>
          {players.map((player, index) => (
            <div key={index} className="flex items-center mb-2">
              <span className="text-white font-choco text-lg mr-2">
                {player.username}
              </span>
              {player.ready ? (
                <span className="text-green-500">✓</span>
              ) : (
                player.id === socket.id && (
                  <button
                    onClick={handleReady}
                    className="ml-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                  >
                    Ready
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <KeyboardControls map={memoizedKeyboardMap}>
        <Canvas camera={{ position: [0, 3, 3], fov: 60, near: 1 }} shadows>
          <ambientLight intensity={3} />
          <directionalLight
            intensity={0.5}
            castShadow
            position={[-15, 20, 0]}
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-bias={-0.0005}
          >
            <OrthographicCamera
              left={-500}
              right={500}
              top={500}
              bottom={-500}
              near={1}
              far={2000}
              attach="shadow-camera"
            />
          </directionalLight>
          <Physics>
            {isGameStarted && (
              <>
                <PlayerController
                  ref={playerControllerRef}
                  joystickDirection={joystickDirection}
                  onPunch={punchPressed}
                  onKick={kickPressed}
                  onUpdate={handlePlayerUpdate}
                  onAction={handlePlayerAction}
                />
                <OpponentController
                  position={opponentPosition}
                  rotation={opponentRotation}
                  animation={opponentAnimation}
                />
              </>
            )}
            <Arena />
            <RigidBody
              type="fixed"
              colliders={false}
              sensor
              name="arenaBounds"
              position-y={-21}
            >
              <CuboidCollider args={[500, 0.5, 500]} />
            </RigidBody>
          </Physics>
        </Canvas>
      </KeyboardControls>

      {isGameStarted && (
        <>
          <Joystick onMove={setJoystickDirection} />
          <AttackButtons onPunch={setPunchPressed} onKick={setKickPressed} />
        </>
      )}

      <Info showInfoPopup={showInfoPopup} setShowInfoPopup={setShowInfoPopup} />
    </>
  );
};

export default Experience;
