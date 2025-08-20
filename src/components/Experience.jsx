"use client";
import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
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
  // --- Context ---
  const socket = useSocket();
  const [playerId, setPlayerId] = useState(null);

  // --- State ---
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

  // --- Refs ---
  const beginSoundRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const audioContextRef = useRef(null);
  const nameInputRef = useRef(null);
  const joinBtnRef = useRef(null);

  const hasPlayedStartSound = useRef(false);
  const hasLoggedResult = useRef(false);

  const carControllerRef1 = useRef();
  const carControllerRef2 = useRef();
  const blockRef = useRef();
  const hasStarted = useRef(false);
  const welcomeTextRef = useRef();

  // --- Memo ---
  const memoizedKeyboardMap = useMemo(() => keyboardMap, []);

  useEffect(() => {
    if (socket && socket.id) {
      setPlayerId(socket.id);
    }

    // Just in case socket.id isn't immediately available
    const interval = setInterval(() => {
      if (socket?.id && !playerId) {
        setPlayerId(socket.id);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [socket, playerId]);

  // --- Audio: create start sound early ---
  useEffect(() => {
    beginSoundRef.current = new Audio("/begin.mp3");
    beginSoundRef.current.volume = 0.7;
    return () => {
      if (beginSoundRef.current) {
        beginSoundRef.current.pause();
        beginSoundRef.current = null;
      }
    };
  }, []);

  // --- Helpers ---
  const unlockAllAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    try {
      const AC =
        window.AudioContext ||
        // @ts-ignore
        window.webkitAudioContext;
      if (AC) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AC();
        }
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch(() => {});
        }
      }

      const sources = [
        "/punch.mp3",

        "/hit.mp3",
        "/victory.mp3",
        "/lost.mp3",
        "/begin.mp3",
      ];

      const warmups = sources.map((src) => {
        const a = new Audio(src);
        a.preload = "auto";
        // @ts-ignore
        a.playsInline = true;
        a.muted = true; // stays muted permanently
        return a
          .play()
          .then(() => {
            a.pause();
            a.currentTime = 0;
            return true;
          })
          .catch(() => false);
      });

      Promise.all(warmups).finally(() => {
        audioUnlockedRef.current = true;
      });
    } catch {
      audioUnlockedRef.current = true;
    }
  }, []);

  const isUsernameUnique = useCallback(
    (name) => !players.some((player) => player.name === name),
    [players]
  );

  // --- Handlers (callbacks used by effects must be defined before those effects) ---
  const handleJoinRoom = useCallback(() => {
    if (!socket) {
      console.error("Socket is not available");
      setPopupMessage("Connection error. Please refresh the page.");
      setShowPopup(true);
      return;
    }

    unlockAllAudio();

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
  }, [
    socket,
    unlockAllAudio,
    playerName,
    hasJoinedRoom,
    players.length,
    isUsernameUnique,
  ]);

  const handleReset = useCallback(() => {
    hasLoggedResult.current = false;
    hasPlayedStartSound.current = false;
    setRestartCountdown(2);
    setTimeout(() => {
      setShowPopup(false);
      setWinner(null);
      setLoser(null);
      setPlayerLeft(false);
      hasStarted.current = false;

      if (blockRef.current) blockRef.current.setEnabled(true);
      setShowWelcomeScreen(true);
      setPlayers([]);
      setIsReady(false);
      setHasJoinedRoom(false);
      setPlayerName("");
      setHealth1(100);
      setHealth2(100);
      if (socket) socket.emit("restartGame");
    }, 2000);
  }, [socket]);

  const handleInfoClick = useCallback(() => {
    setShowInfoPopup(true);
  }, []);

  const handleReady = useCallback(() => {
    if (socket) {
      socket.emit("playerReady", playerName);
      setIsReady(true);
    }
  }, [socket, playerName]);

  const onPlayerHit = useCallback(
    (data) => {
      if (winner || loser) return;

      socket.emit("updateHealth", {
        health1:
          data.attackerId === players[0]?.id
            ? health1
            : Math.max(0, health1 - data.damage),
        health2:
          data.attackerId === players[1]?.id
            ? health2
            : Math.max(0, health2 - data.damage),
      });

      if (players[0]?.id === data.attackerId) {
        setHealth2((prev) => {
          const newHealth = Math.max(0, prev - data.damage);
          if (newHealth <= 0) {
            setTimeout(() => {
              socket.emit("playerDefeated", {
                winnerId: players[0].id,
                loserId: players[1]?.id,
                winnerHealth: health1,
                loserHealth: newHealth,
                winningAttackTime: data.attackTime,
              });
            }, 50);
          }
          return newHealth;
        });
      } else if (players[1]?.id === data.attackerId) {
        setHealth1((prev) => {
          const newHealth = Math.max(0, prev - data.damage);
          if (newHealth <= 0) {
            setTimeout(() => {
              socket.emit("playerDefeated", {
                winnerId: players[1].id,
                loserId: players[0]?.id,
                winnerHealth: health2,
                loserHealth: newHealth,
                winningAttackTime: data.attackTime,
              });
            }, 50);
          }
          return newHealth;
        });
      }
    },
    [socket, players, winner, loser, health1, health2]
  );

  const onPlayerDefeated = useCallback(
    (data) => {
      if (!hasLoggedResult.current) {
        if (!data || typeof data !== "object") return;
        if (data.winnerId === data.loserId) return;

        const winnerPlayer = players.find((p) => p.id === data.winnerId);
        const loserPlayer = players.find((p) => p.id === data.loserId);
        if (!winnerPlayer || !loserPlayer) return;

        if (players[0]?.id === data.winnerId) {
          setHealth1(data.winnerHealth);
          setHealth2(0);
        } else {
          setHealth1(0);
          setHealth2(data.winnerHealth);
        }

        setWinner(winnerPlayer);
        setLoser(loserPlayer);

        hasLoggedResult.current = true;

        if (carControllerRef1.current && carControllerRef2.current) {
          if (players[0]?.id === data.winnerId) {
            carControllerRef1.current.setVictory(players[0]?.id === socket?.id);
            carControllerRef2.current.setDefeat(players[1]?.id === socket?.id);
          } else {
            carControllerRef1.current.setDefeat(players[0]?.id === socket?.id);
            carControllerRef2.current.setVictory(players[1]?.id === socket?.id);
          }
        }
      }

      setTimeout(() => {
        const isLocalPlayerWinner = socket?.id === data.winnerId;
        setPopupMessage(isLocalPlayerWinner ? "YOU WON!" : "YOU LOST!");
        setShowPopup(true);
        setRestartCountdown(5);
      }, 2000);
    },
    [players, socket?.id]
  );

  // --- Effects (that rely on the helpers/handlers above) ---
  // Attach gesture unlock to input + JOIN button
  useEffect(() => {
    const inputEl = nameInputRef.current;
    const joinEl = joinBtnRef.current;
    if (!inputEl && !joinEl) return;

    const handler = () => {
      unlockAllAudio();
    };

    const opts = { passive: true };
    if (inputEl) {
      inputEl.addEventListener("pointerdown", handler, opts);
      inputEl.addEventListener("touchstart", handler, opts);
      inputEl.addEventListener("mousedown", handler, opts);
      inputEl.addEventListener("focus", handler, opts);
    }
    if (joinEl) {
      joinEl.addEventListener("pointerdown", handler, opts);
      joinEl.addEventListener("touchstart", handler, opts);
      joinEl.addEventListener("mousedown", handler, opts);
      joinEl.addEventListener("click", handler, opts);
    }
    return () => {
      if (inputEl) {
        inputEl.removeEventListener("pointerdown", handler, opts);
        inputEl.removeEventListener("touchstart", handler, opts);
        inputEl.removeEventListener("mousedown", handler, opts);
        inputEl.removeEventListener("focus", handler, opts);
      }
      if (joinEl) {
        joinEl.removeEventListener("pointerdown", handler, opts);
        joinEl.removeEventListener("touchstart", handler, opts);
        joinEl.removeEventListener("mousedown", handler, opts);
        joinEl.removeEventListener("click", handler, opts);
      }
    };
  }, [showWelcomeScreen, unlockAllAudio]);

  // Validate username as user types
  useEffect(() => {
    if (playerName.trim() !== "") {
      setIsUsernameValid(isUsernameUnique(playerName.trim()));
    }
  }, [playerName, isUsernameUnique]);

  // Welcome text animation
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

  // Hard reload if server says you’re a 3rd player
  useEffect(() => {
    if (shouldReload) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldReload]);

  // Health sync (incoming)
  useEffect(() => {
    if (!socket) return;
    const updateHealthHandler = ({
      health1: newHealth1,
      health2: newHealth2,
    }) => {
      setHealth1(newHealth1);
      setHealth2(newHealth2);
    };
    socket.on("updateHealth", updateHealthHandler);
    return () => {
      socket.off("updateHealth", updateHealthHandler);
    };
  }, [socket]);

  // Socket events: players, start, restart, username taken, combat
  useEffect(() => {
    if (!socket) return;

    const updatePlayersHandler = (playersList) => {
      if (playersList.length > 2) {
        const currentPlayerIndex = playersList.findIndex(
          (p) => p.id === socket.id
        );
        if (currentPlayerIndex >= 2) {
          setShouldReload(true);
          return;
        }
      }
      setPlayers(playersList);

      if (isGameStarted && playersList.length === 1) {
        setPlayerLeft(true);
        setPopupMessage("The other player has left the game.");
        setShowPopup(true);
        handleReset();
      }
    };

    const startGameHandler = () => {
      unlockAllAudio(); // ✅ ensure iOS AudioContext is resumed
      let count = 3;
      setCountdown(count);

      const interval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count === 0) {
          clearInterval(interval);
          setShowWelcomeScreen(false);
          setIsGameStarted(true);

          if (!hasPlayedStartSound.current && beginSoundRef.current) {
            beginSoundRef.current.currentTime = 0;
            beginSoundRef.current
              .play()
              .catch((e) => console.log("Audio play failed:", e));
            hasPlayedStartSound.current = true;
          }
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
  }, [socket, isGameStarted, handleReset, onPlayerHit, onPlayerDefeated]);

  // Cross-link player controllers when game starts
  useEffect(() => {
    if (
      isGameStarted &&
      carControllerRef1.current &&
      carControllerRef2.current
    ) {
      carControllerRef1.current.setOpponentRef(carControllerRef2.current);
      carControllerRef2.current.setOpponentRef(carControllerRef1.current);
    }
  }, [isGameStarted, players, socket?.id]);

  // ✅ ADD: Re-link after reset or restart
  useEffect(() => {
    if (carControllerRef1.current && carControllerRef2.current) {
      carControllerRef1.current.setOpponentRef(carControllerRef2.current);
      carControllerRef2.current.setOpponentRef(carControllerRef1.current);
    }
  }, [players]);

  // Restart countdown -> trigger reset
  useEffect(() => {
    if (restartCountdown !== null && restartCountdown > 0) {
      const interval = setInterval(() => {
        setRestartCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (restartCountdown === 0) {
      handleReset();
    }
  }, [restartCountdown, handleReset]);

  if (!playerId) {
    return <div>Loading...</div>; // or a splash screen
  }

  // --- Render ---
  return (
    <>
      <KeyboardControls map={memoizedKeyboardMap}>
        <Canvas camera={{ position: [0, 5, 10], fov: 60 }} shadows>
          <ambientLight intensity={2.3} />
          <Background />
          <directionalLight
            intensity={1.5}
            castShadow
            position={[3, 10, 3]}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0015}
            shadow-normalBias={0.03}
            shadow-camera-near={0.5}
            shadow-camera-far={25}
            shadow-camera-left={-3}
            shadow-camera-right={3}
            shadow-camera-top={3}
            shadow-camera-bottom={-3}
          ></directionalLight>

          <Physics
            contactPairPersistentThreshold={0.08}
            substeps={2}
            solverIterations={8}
            timeStep="vary"
          >
            <Ring />
            {isGameStarted && (
              <>
                <PlayerController
                  ref={carControllerRef1}
                  playerId={playerId}
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
                  playerId={playerId}
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
              {"Welcome to NishFight".split("").map((letter, index) => (
                <span key={index} className="inline-block">
                  {letter === " " ? "\u00A0" : letter}
                </span>
              ))}
            </div>
            <div>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onPointerDown={unlockAllAudio}
                className="px-4 py-2 mb-4 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-4 sm:w-[70%] w-[80%] mx-auto">
              <button
                ref={joinBtnRef}
                onClick={handleJoinRoom}
                onPointerDown={unlockAllAudio}
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
          {/* Player 1 */}
          <div className="flex flex-col items-start">
            <div className="w-40 h-6 bg-red-500 rounded-md overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${health1}%` }}
              />
            </div>
            <div className="text-white font-bold mt-1">
              {players[0]?.name || "Player 1"}
              {players[0]?.id === socket?.id && " (You)"}
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex flex-col items-end">
            <div className="w-40 h-6 bg-red-500 rounded-md overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${health2}%` }}
              />
            </div>
            <div className="text-white font-bold mt-1">
              {players[1]?.name || "Player 2"}
              {players[1]?.id === socket?.id && " (You)"}
            </div>
          </div>
        </div>
      )}

      {showPopup && (
        <div className="fixed inset-0 flex top-[10%] items-start justify-center bg-opacity-80 z-[103]">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4 text-black">Fight Over!</h2>
            <p className="mb-4 text-xl text-black">{popupMessage}</p>
            {restartCountdown !== null ? (
              <>
                <p className="text-black mb-2">
                  Game will restart automatically...
                </p>
              </>
            ) : (
              <>
                <p className="text-black mb-2">
                  Game will restart automatically...
                </p>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg"
                >
                  Restart Now
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <Joystick
        onMove={(data) => {
          setJoystickInput({ x: data.x, y: data.y, isRunning: data.isRunning });
        }}
        onToggleRun={(isRunning) => {
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
