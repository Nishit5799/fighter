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
  OrbitControls,
  OrthographicCamera,
} from "@react-three/drei";
import { Physics } from "@react-three/rapier";

import Joystick from "./Joystick";
import AttackButtons from "./AttackButtons";

import gsap from "gsap";
import { useSocket } from "../context/SocketContext";

import Info from "./Info";
import Arena from "./Arena";
import PlayerController from "./PlayerController";
import Ring from "./Ring";

const keyboardMap = [
  {
    name: "forward",
    keys: ["ArrowUp", "KeyW"],
  },
  {
    name: "backward",
    keys: ["ArrowDown", "KeyS"],
  },
  {
    name: "left",
    keys: ["ArrowLeft", "KeyA"],
  },
  {
    name: "right",
    keys: ["ArrowRight", "KeyD"],
  },
  {
    name: "run",
    keys: ["Shift"],
  },
  {
    name: "punch",
    keys: ["KeyP"],
  },
  {
    name: "kick",
    keys: ["KeyK"],
  },
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

  const handleRaceEnd = useCallback(
    (isPlayer1) => {
      if (!players || players.length < 2) return;

      const winnerPlayer = isPlayer1 ? players[0] : players[1];
      const loserPlayer = isPlayer1 ? players[1] : players[0];

      setWinner(winnerPlayer);
      setLoser(loserPlayer);

      console.log(
        `Winner: ${winnerPlayer.name} (ID: ${winnerPlayer.id}), Is Player 1: ${isPlayer1}`
      );
      console.log(
        `Loser: ${loserPlayer.name} (ID: ${
          loserPlayer.id
        }), Is Player 1: ${!isPlayer1}`
      );

      if (isPlayer1) {
        setPopupMessage(`You won, ${winnerPlayer.name}! Well played!`);
        carControllerRef1.current?.playVictorySound();
      } else {
        setPopupMessage(
          `You lost, ${winnerPlayer.name}. ${loserPlayer.name} won the race. Let's try again!`
        );
        carControllerRef1.current?.playLostSound();
      }

      setShowPopup(true);
      hasStarted.current = false;

      if (socket) {
        socket.emit("raceEnd", isPlayer1);
      }
    },
    [players, socket]
  );

  const handleReset = useCallback(() => {
    setRestartCountdown(2);

    setTimeout(() => {
      setShowPopup(false);
      setWinner(null);
      setLoser(null);
      setPlayerLeft(false);
      hasStarted.current = false;
      if (carControllerRef1.current) {
        carControllerRef1.current.respawn();
      }
      if (carControllerRef2.current) {
        carControllerRef2.current.respawn();
      }
      if (blockRef.current) {
        blockRef.current.setEnabled(true);
      }
      setShowWelcomeScreen(true);
      setPlayers([]);
      setIsReady(false);
      setHasJoinedRoom(false);
      setPlayerName("");
      if (socket) {
        socket.emit("restartGame");
      }
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

  useEffect(() => {
    if (socket) {
      const updatePlayersHandler = (players) => {
        console.log("Received updatePlayers event:", players);

        if (players.length > 2) {
          const currentPlayerIndex = players.findIndex(
            (p) => p.id === socket.id
          );
          if (currentPlayerIndex >= 2) {
            console.log(
              `Player ${socket.id} is in position ${
                currentPlayerIndex + 1
              }, reloading...`
            );
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

      return () => {
        socket.off("updatePlayers", updatePlayersHandler);
        socket.off("startGame", startGameHandler);
        socket.off("restartGame", restartGameHandler);
        socket.off("usernameTaken", usernameTakenHandler);
      };
    }
  }, [socket, isGameStarted, players, handleReset, shouldReload]);

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

  useEffect(() => {
    if (!socket) return;

    const onPlayerHit = (data) => {
      if (players[0]?.id === data.attackerId) {
        setHealth2((prev) => Math.max(0, prev - data.damage));
      } else if (players[1]?.id === data.attackerId) {
        setHealth1((prev) => Math.max(0, prev - data.damage));
      }
    };

    const onPlayerDefeated = (data) => {
      if (players[0]?.id === data.winnerId) {
        setPopupMessage(`${players[0].name} won the match!`);
        setWinner(players[0]);
        setLoser(players[1]);
      } else if (players[1]?.id === data.winnerId) {
        setPopupMessage(`${players[1].name} won the match!`);
        setWinner(players[1]);
        setLoser(players[0]);
      }
      setShowPopup(true);
    };

    socket.on("playerHit", onPlayerHit);
    socket.on("playerDefeated", onPlayerDefeated);

    return () => {
      socket.off("playerHit", onPlayerHit);
      socket.off("playerDefeated", onPlayerDefeated);
    };
  }, [socket, players]);

  const memoizedKeyboardMap = useMemo(() => keyboardMap, []);

  useEffect(() => {
    if (restartCountdown !== null && restartCountdown > 0) {
      const interval = setInterval(() => {
        setRestartCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [restartCountdown]);

  return (
    <>
      <KeyboardControls map={memoizedKeyboardMap}>
        <Canvas camera={{ position: [0, 5, 10], fov: 60 }} shadows>
          <Environment preset="sunset" />
          {/* <OrbitControls /> */}
          <directionalLight
            intensity={0.5}
            castShadow
            position={[-15, 20, 0]}
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

          <Physics>
            {/* <Arena /> */}
            <Ring />

            {isGameStarted && (
              <>
                <PlayerController
                  ref={carControllerRef1}
                  characterType="cena"
                  joystickInput={
                    players[0]?.id === socket?.id ? joystickInput : null
                  }
                  onRaceEnd={handleRaceEnd}
                  disabled={!isGameStarted}
                  position={[1.6, 0, 0]}
                  isPlayer1={players[0]?.id === socket?.id}
                  color={0x90902d}
                  isPunching={
                    players[0]?.id === socket?.id ? isPunching : false
                  }
                  isKicking={players[0]?.id === socket?.id ? isKicking : false}
                />
                <PlayerController
                  ref={carControllerRef2}
                  characterType="austin"
                  joystickInput={
                    players[1]?.id === socket?.id ? joystickInput : null
                  }
                  onRaceEnd={handleRaceEnd}
                  disabled={!isGameStarted}
                  position={[-1.6, 0, 0]}
                  isPlayer1={players[1]?.id === socket?.id}
                  color={0x2b2ba1}
                  isPunching={
                    players[1]?.id === socket?.id ? isPunching : false
                  }
                  isKicking={players[1]?.id === socket?.id ? isKicking : false}
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

      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-[103]">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4">Race Over!</h2>
            <p className="mb-4">{popupMessage}</p>
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
        onMove={setJoystickInput}
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
