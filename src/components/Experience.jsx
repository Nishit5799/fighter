"use client";
import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  KeyboardControls,
  OrthographicCamera,
} from "@react-three/drei";
import { Physics } from "@react-three/rapier";

import Joystick from "./Joystick";
import AttackButtons from "./AttackButtons";
import gsap from "gsap";
import { useSocket } from "../context/SocketContext";
import Info from "./Info";
import PlayerController from "./PlayerController";
import Ring from "./Ring";
import Background from "./Background";

const keyboardMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "run", keys: ["Shift"] },
  { name: "punch", keys: ["KeyP"] },
  { name: "kick", keys: ["KeyK"] },
];

const Experience = () => {
  const socket = useSocket();
  const shadowCameraRef = useRef();
  const [joystickInput, setJoystickInput] = useState({ x: 0, y: 0 });
  const [isPunching, setIsPunching] = useState(false);
  const [isKicking, setIsKicking] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  const [shouldReload, setShouldReload] = useState(false);
  const [health1, setHealth1] = useState(100);
  const [health2, setHealth2] = useState(100);
  const [winner, setWinner] = useState(null);
  const [loser, setLoser] = useState(null);
  const [playerLeft, setPlayerLeft] = useState(false);
  const [isUsernameValid, setIsUsernameValid] = useState(true);
  const [restartCountdown, setRestartCountdown] = useState(null);

  const carControllerRef1 = useRef();
  const carControllerRef2 = useRef();
  const blockRef = useRef();
  const hasStarted = useRef(false);
  const welcomeTextRef = useRef();

  const isUsernameUnique = (name) => {
    return !players.some((player) => player.name === name);
  };

  const handleJoinRoom = () => {
    if (!socket) {
      console.error("Socket is not available");
      setPopupMessage("Connection error. Please refresh the page.");
      setShowPopup(true);
      return;
    }

    const trimmedName = playerName.trim();
    if (trimmedName !== "" && !hasJoinedRoom) {
      if (players.length >= 2) {
        setPopupMessage("Room is already full. Please try again later.");
        setShowPopup(true);
        setTimeout(() => window.location.reload(), 1000);
        return;
      }

      if (isUsernameUnique(trimmedName)) {
        socket.emit("joinRoom", trimmedName);
        setHasJoinedRoom(true);
        setIsUsernameValid(true);
      } else {
        setIsUsernameValid(false);
      }
    }
  };

  useEffect(() => {
    if (playerName.trim() !== "") {
      setIsUsernameValid(isUsernameUnique(playerName.trim()));
    }
  }, [playerName, players]);

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

  const handleReset = useCallback(() => {
    setRestartCountdown(2);
    setTimeout(() => {
      setShowPopup(false);
      setWinner(null);
      setLoser(null);
      setPlayerLeft(false);
      hasStarted.current = false;
      if (carControllerRef1.current) carControllerRef1.current.respawn();
      if (carControllerRef2.current) carControllerRef2.current.respawn();
      if (blockRef.current) blockRef.current.setEnabled(true);
      setShowWelcomeScreen(true);
      setPlayers([]);
      setIsReady(false);
      setHasJoinedRoom(false);
      setPlayerName("");
      if (socket) socket.emit("restartGame");
      window.location.reload();
    }, 2000);
  }, [socket]);

  const handleInfoClick = useCallback(() => {
    setShowInfoPopup(true);
  }, []);

  const handleReady = () => {
    if (socket) {
      socket.emit("playerReady", playerName);
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (shouldReload) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldReload]);

  const onPlayerHit = useCallback(
    (data) => {
      if (winner || loser) return;

      // Use functional updates to ensure we get latest state
      if (players[0]?.id === data.attackerId) {
        setHealth2((prev) => {
          const newHealth = Math.max(0, prev - data.damage);
          console.log(`Player 2 health: ${prev} -> ${newHealth}`);

          if (newHealth <= 0) {
            setTimeout(() => {
              socket.emit("playerDefeated", {
                winnerId: players[0].id,
                loserId: players[1]?.id,
                winnerHealth: health1,
                loserHealth: newHealth,
              });
            }, 50);
          }
          return newHealth;
        });
      } else if (players[1]?.id === data.attackerId) {
        setHealth1((prev) => {
          const newHealth = Math.max(0, prev - data.damage);
          console.log(`Player 1 health: ${prev} -> ${newHealth}`);

          if (newHealth <= 0) {
            setTimeout(() => {
              socket.emit("playerDefeated", {
                winnerId: players[1].id,
                loserId: players[0]?.id,
                winnerHealth: health2,
                loserHealth: newHealth,
              });
            }, 50);
          }
          return newHealth;
        });
      }
    },
    [socket, players, winner, loser, health1, health2]
  );

  // In Experience.jsx, inside the onPlayerDefeated callback function
  // In Experience.jsx, update the onPlayerDefeated callback
  const onPlayerDefeated = useCallback(
    (data) => {
      console.log(
        `[FINAL HEALTH] Winner: ${data.winnerHealth}% | Loser: ${data.loserHealth}%`
      );

      // Set health first
      if (players[0]?.id === data.winnerId) {
        setHealth1(data.winnerHealth);
        setHealth2(data.loserHealth);
        setWinner(players[0]);
        setLoser(players[1]);
      } else if (players[1]?.id === data.winnerId) {
        setHealth1(data.loserHealth);
        setHealth2(data.winnerHealth);
        setWinner(players[1]);
        setLoser(players[0]);
      }

      // Force animation update through car controllers
      if (carControllerRef1.current && carControllerRef2.current) {
        if (players[0]?.id === data.winnerId) {
          carControllerRef1.current.setVictory();
          carControllerRef2.current.setDefeat();
        } else {
          carControllerRef1.current.setDefeat();
          carControllerRef2.current.setVictory();
        }
      }

      // Show popup after 2 seconds
      setTimeout(() => {
        if (players[0]?.id === data.winnerId) {
          setPopupMessage(
            players[0]?.id === socket?.id ? "YOU WON!" : "YOU LOST!"
          );
        } else {
          setPopupMessage(
            players[1]?.id === socket?.id ? "YOU WON!" : "YOU LOST!"
          );
        }
        setShowPopup(true);
      }, 2000);
    },
    [players, socket?.id]
  );
  useEffect(() => {
    if (socket) {
      const updatePlayersHandler = (players) => {
        if (players.length > 2) {
          const currentPlayerIndex = players.findIndex(
            (p) => p.id === socket.id
          );
          if (currentPlayerIndex >= 2) {
            setShouldReload(true);
            return;
          }
        }
        setPlayers(players);

        if (isGameStarted && players.length === 1) {
          setPlayerLeft(true);
          setPopupMessage("The other player has left the game.");
          setShowPopup(true);
          handleReset();
        }
      };

      const startGameHandler = () => {
        let count = 3;
        setCountdown(count);
        const interval = setInterval(() => {
          count -= 1;
          setCountdown(count);
          if (count === 0) {
            clearInterval(interval);
            setShowWelcomeScreen(false);
            setIsGameStarted(true);
          }
        }, 1000);
      };

      const restartGameHandler = () => {
        window.location.reload();
      };

      const usernameTakenHandler = () => {
        setIsUsernameValid(false);
      };

      socket.on("updatePlayers", updatePlayersHandler);
      socket.on("startGame", startGameHandler);
      socket.on("restartGame", restartGameHandler);
      socket.on("usernameTaken", usernameTakenHandler);
      socket.on("playerHit", onPlayerHit);
      socket.on("playerDefeated", onPlayerDefeated);

      return () => {
        socket.off("updatePlayers", updatePlayersHandler);
        socket.off("startGame", startGameHandler);
        socket.off("restartGame", restartGameHandler);
        socket.off("usernameTaken", usernameTakenHandler);
        socket.off("playerHit", onPlayerHit);
        socket.off("playerDefeated", onPlayerDefeated);
      };
    }
  }, [socket, isGameStarted, handleReset, onPlayerHit, onPlayerDefeated]);

  useEffect(() => {
    console.log("Current health state:", { health1, health2 });
  }, [health1, health2]);

  useEffect(() => {
    if (
      isGameStarted &&
      carControllerRef1.current &&
      carControllerRef2.current
    ) {
      if (players[0]?.id === socket?.id) {
        carControllerRef1.current.setOpponentRef(carControllerRef2.current);
        carControllerRef2.current.setOpponentRef(carControllerRef1.current);
      } else if (players[1]?.id === socket?.id) {
        carControllerRef1.current.setOpponentRef(carControllerRef2.current);
        carControllerRef2.current.setOpponentRef(carControllerRef1.current);
      }
    }
  }, [isGameStarted, players, socket?.id]);

  const memoizedKeyboardMap = useMemo(() => keyboardMap, []);

  useEffect(() => {
    if (restartCountdown !== null && restartCountdown > 0) {
      const interval = setInterval(() => {
        setRestartCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [restartCountdown]);

  useEffect(() => {
    console.log("Health State Updated:", {
      player1: { health: health1, name: players[0]?.name },
      player2: { health: health2, name: players[1]?.name },
    });
  }, [health1, health2, players]);

  return (
    <>
      <KeyboardControls map={memoizedKeyboardMap}>
        <Canvas camera={{ position: [0, 5, 10], fov: 60 }} shadows>
          <Environment preset="sunset" />
          <Background />
          <directionalLight
            intensity={1}
            castShadow
            position={[0, 10, 0]}
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-bias={-0.0005}
            shadow-camera-left={-500}
            shadow-camera-right={500}
            shadow-camera-top={500}
            shadow-camera-bottom={-500}
            shadow-camera-near={1}
            shadow-camera-far={2000}
          >
            <OrthographicCamera
              left={-500}
              right={500}
              top={500}
              bottom={-500}
              near={1}
              far={2000}
              ref={shadowCameraRef}
              attach={"shadow-camera"}
            />
          </directionalLight>

          <Physics
            contactPairPersistentThreshold={0.08}
            sleepAfterStillness={0.2}
            substeps={2}
            solverIterations={8}
            timeStep="vary"
          >
            <Ring />
            {isGameStarted && (
              <>
                <PlayerController
                  ref={carControllerRef1}
                  characterType="cena"
                  joystickInput={
                    players[0]?.id === socket?.id ? joystickInput : null
                  }
                  disabled={!isGameStarted}
                  position={[1.2, 0, 0]}
                  isPlayer1={players[0]?.id === socket?.id}
                  color={0x90902d}
                  isPunching={
                    players[0]?.id === socket?.id ? isPunching : false
                  }
                  isKicking={players[0]?.id === socket?.id ? isKicking : false}
                  health={health1}
                  opponentHealth={health2}
                  isLocalPlayer={players[0]?.id === socket?.id}
                  playerName={players[0]?.name || "Player 1"}
                  opponentName={players[1]?.name || "Player 2"}
                />
                <PlayerController
                  ref={carControllerRef2}
                  characterType="austin"
                  joystickInput={
                    players[1]?.id === socket?.id ? joystickInput : null
                  }
                  disabled={!isGameStarted}
                  position={[-1.2, 0, 0]}
                  isPlayer1={players[1]?.id === socket?.id}
                  color={0x2b2ba1}
                  isPunching={
                    players[1]?.id === socket?.id ? isPunching : false
                  }
                  isKicking={players[1]?.id === socket?.id ? isKicking : false}
                  health={health2}
                  opponentHealth={health1}
                  isLocalPlayer={players[1]?.id === socket?.id}
                  playerName={players[1]?.name || "Player 2"}
                  opponentName={players[0]?.name || "Player 1"}
                />
              </>
            )}
          </Physics>
        </Canvas>
      </KeyboardControls>

      {showWelcomeScreen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-50 start">
          <div className="text-center">
            {hasJoinedRoom && (
              <button
                onClick={() => {
                  if (socket) {
                    socket.emit("playerRestart", {
                      playerId: socket.id,
                      playerName,
                    });
                  }
                  window.location.reload();
                }}
                className="absolute top-4 left-4 px-4 py-2 bg-red-500 text-white rounded-lg"
              >
                Exit
              </button>
            )}
            <div
              ref={welcomeTextRef}
              className="font-choco tracking-wider text-5xl font-bold text-yellow-400 mb-8 flex"
            >
              {"Welcome to NishGear".split("").map((letter, index) => (
                <span key={index} className="inline-block">
                  {letter === " " ? "\u00A0" : letter}
                </span>
              ))}
            </div>
            <div>
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="px-4 py-2 mb-4 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-4 sm:w-[70%] w-[80%] mx-auto">
              <button
                onClick={handleJoinRoom}
                disabled={
                  hasJoinedRoom ||
                  !isUsernameValid ||
                  playerName.trim().length === 0
                }
                className={`px-8 py-2 font-choco tracking-widest bg-orange-500 text-white sm:text-2xl text-3xl font-bold rounded-lg ${
                  hasJoinedRoom ||
                  !isUsernameValid ||
                  playerName.trim().length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-orange-600"
                } transition-colors`}
              >
                JOIN ROOM
              </button>
            </div>
            <div
              onClick={handleInfoClick}
              className="mt-4 py-2 font-choco text-white sm:text-2xl text-3xl tracking-widest cursor-pointer bg-blue-500 hover:bg-blue-600 sm:w-[70%] w-[80%] mx-auto rounded-lg transition-colors"
            >
              HOW TO PLAY?
            </div>
          </div>
        </div>
      )}

      {hasJoinedRoom && !isGameStarted && (
        <div className="fixed bottom-5 right-5 bg-black bg-opacity-50 text-white p-4 rounded-lg z-[100]">
          <h3>Lobby</h3>
          {players.map((player, index) => (
            <div key={index}>
              {player.name} {player.isReady ? "✅" : "❌"}
            </div>
          ))}
          {players.length === 2 && !isReady && (
            <button
              onClick={handleReady}
              className="mt-2 px-4 py-2 bg-green-500 text-white rounded-lg"
            >
              READY
            </button>
          )}
        </div>
      )}

      {countdown !== null && !isGameStarted && (
        <div className="fixed inset-0 flex items-center justify-center z-[101]">
          <div className="w-[80vw] h-[80vw] rounded-full bg-black text-white text-9xl flex items-center justify-center">
            {countdown}
          </div>
        </div>
      )}

      {isGameStarted && (
        <div className="fixed top-0 left-0 right-0 flex justify-between p-4 z-50">
          {/* Player Health (always on left) */}
          <div className="flex flex-col items-start">
            <div className="w-40 h-6 bg-red-500 rounded-md overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{
                  width: `${
                    players[0]?.id === socket?.id ? health1 : health2
                  }%`,
                }}
              />
            </div>
            <div className="text-white font-bold mt-1">
              {players[0]?.id === socket?.id
                ? players[0]?.name
                : players[1]?.name}
            </div>
          </div>

          {/* Opponent Health (always on right) */}
          <div className="flex flex-col items-end">
            <div className="w-40 h-6 bg-red-500 rounded-md overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{
                  width: `${
                    players[0]?.id === socket?.id ? health2 : health1
                  }%`,
                }}
              />
            </div>
            <div className="text-white font-bold mt-1">
              {players[0]?.id === socket?.id
                ? players[1]?.name
                : players[0]?.name}
            </div>
          </div>
        </div>
      )}
      {showPopup && (
        <div className="fixed inset-0 flex items-start justify-center  bg-opacity-80 z-[103]">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4 text-black">Fight Over!</h2>
            <p className="mb-4 text-xl text-black">{popupMessage}</p>
            {restartCountdown !== null ? (
              <p className="text-black">RESTARTING IN {restartCountdown}...</p>
            ) : (
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg"
              >
                Restart
              </button>
            )}
          </div>
        </div>
      )}

      <Joystick
        onMove={(data) => {
          // Pass isRunning to the joystickInput
          setJoystickInput({ x: data.x, y: data.y, isRunning: data.isRunning });
        }}
        onToggleRun={(isRunning) => {
          // Update the run state when the button is toggled
          setJoystickInput((prev) => ({ ...prev, isRunning }));
        }}
        onStart={() => {}}
        disabled={!isGameStarted || players.length !== 2}
      />

      {isGameStarted && (
        <AttackButtons
          onPunch={(punching) => setIsPunching(punching)}
          onKick={(kicking) => setIsKicking(kicking)}
        />
      )}

      <Info
        onReset={handleReset}
        showPopup={showPopup}
        popupMessage={popupMessage}
        showInfoPopup={showInfoPopup}
        setShowInfoPopup={setShowInfoPopup}
        onInfoClick={handleInfoClick}
      />
    </>
  );
};

export default Experience;
