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
import { Leva, useCreateStore } from "leva";
import audioPool from "@/utils/audioPool";

const unlockAudio = (audio) => {
  if (!audio) return;

  Object.values(audio).forEach((sound) => {
    try {
      const silentClone = sound.cloneNode(); // create a clone
      silentClone.muted = true; // ensure it's muted
      silentClone.volume = 0; // double safety
      silentClone.play().catch(() => {});
    } catch (err) {
      console.warn("Silent audio unlock failed:", err);
    }
  });
};

// (near the top, after other imports)
const SOUND_FILES = {
  punch: "/punch.mp3",
  kick: "/punch.mp3",
  hit: "/hit.mp3",
  victory: "/victory.mp3",
  lost: "/lost.mp3",
  begin: "/begin.mp3",
};

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

  // --- State ---
  const levaStore = useCreateStore();
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
  const [showSettings, setShowSettings] = useState(false);
  const [swipeRotationDelta, setSwipeRotationDelta] = useState(0);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [hasTappedToBegin, setHasTappedToBegin] = useState(false);
  const [showJoinWarning, setShowJoinWarning] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(true);

  const localPlayer = players.find((p) => p.id === socket?.id);

  // --- Refs ---
  const settingsRef = useRef();
  const settingsPanelRef = useRef(null); // for Leva panel container
  const settingsButtonRef = useRef(null); // for settings icon button
  const hasStartedGameRef = useRef(false); // put this above useEffect if not already there

  const unlockRetryRef = useRef(0);
  const audioUnlockedRef = useRef(false);
  const audioContextRef = useRef(null);
  const soundsRef = useRef({
    punch: null,
    kick: null,
    hit: null,
    victory: null,
    lost: null,
    begin: null,
  });
  const nameInputRef = useRef(null);
  const joinBtnRef = useRef(null);

  const hasPlayedStartSound = useRef(false);
  const hasLoggedResult = useRef(false);

  const carControllerRef1 = useRef();
  const carControllerRef2 = useRef();
  const cameraToggleRef = useRef();

  const blockRef = useRef();
  const hasStarted = useRef(false);
  const welcomeTextRef = useRef();
  const joystickRef = useRef();
  const bgMusicRef = useRef(null);

  // --- Memo ---
  const memoizedKeyboardMap = useMemo(() => keyboardMap, []);

  const toggleSettings = () => {
    setShowSettings((prev) => !prev);
  };

  useEffect(() => {
    let swipeTouchId = null;
    let startX = 0;

    const handleTouchStart = (e) => {
      const joystickTouchId = joystickRef.current?.getTouchId?.();
      const candidateTouch = Array.from(e.touches).find(
        (t) => t.identifier !== joystickTouchId
      );

      if (candidateTouch) {
        swipeTouchId = candidateTouch.identifier;
        startX = candidateTouch.clientX;
      }
    };

    const handleTouchMove = (e) => {
      if (swipeTouchId !== null) {
        const touch = Array.from(e.touches).find(
          (t) => t.identifier === swipeTouchId
        );
        if (touch) {
          const deltaX = touch.clientX - startX;
          const normalizedDelta = deltaX / window.innerWidth;
          setSwipeRotationDelta(normalizedDelta);
        }
      }
    };

    const handleTouchEnd = (e) => {
      if (
        swipeTouchId !== null &&
        !Array.from(e.touches).some((t) => t.identifier === swipeTouchId)
      ) {
        swipeTouchId = null;
        setSwipeRotationDelta(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    const audio = bgMusicRef.current;
    if (audio) {
      const playMusic = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      };

      // Attempt to play immediately
      playMusic();

      // Unlock for iOS or browser restrictions
      const unlock = () => {
        audio.play().catch(() => {});
        document.removeEventListener("click", unlock);
        document.removeEventListener("touchstart", unlock);
      };

      document.addEventListener("click", unlock);
      document.addEventListener("touchstart", unlock);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedOutsidePanel =
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(event.target);
      const clickedOutsideButton =
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(event.target);

      if (clickedOutsidePanel && clickedOutsideButton) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSettings]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedOutsidePanel =
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(event.target);

      const clickedOutsideButton =
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(event.target);

      if (clickedOutsidePanel && clickedOutsideButton) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSettings]);

  // --- Helpers ---
  const unlockAllAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    const ensureAudioContext = () => {
      if (!AC) return;
      if (!audioContextRef.current) audioContextRef.current = new AC();
      if (audioContextRef.current.state === "suspended") {
        return audioContextRef.current.resume().catch(() => {});
      }
    };

    const warm = () => {
      const items = Object.values(soundsRef.current).filter(Boolean);

      if (items.length === 0) {
        unlockRetryRef.current += 1;
        if (unlockRetryRef.current <= 10) {
          setTimeout(warm, 50); // Try again
        }
        return;
      }

      // ✅ Silent warmup logic
      items.forEach((a) => {
        try {
          const silentClone = a.cloneNode(); // Clone each audio tag
          silentClone.muted = true;
          silentClone.volume = 0;
          silentClone.currentTime = 0;
          silentClone.play().catch(() => {});
        } catch (err) {
          console.warn("Silent warmup failed:", err);
        }
      });

      audioUnlockedRef.current = true; // ✅ Prevent re-unlocking
    };

    ensureAudioContext(); // Resume WebAudio if needed
    warm(); // Perform silent warmup
  }, []);

  useEffect(() => {
    const handler = () => unlockAllAudio();
    const opts = { passive: true };
    const events = [
      "pointerdown",
      "touchstart",
      "mousedown",
      "click",
      "keydown",
    ];

    events.forEach((ev) => document.addEventListener(ev, handler, opts));
    return () =>
      events.forEach((ev) => document.removeEventListener(ev, handler, opts));
  }, [unlockAllAudio]);

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
    if (trimmedName === "") {
      setShowJoinWarning(true);
      nameInputRef.current?.focus();
      return;
    }
    if (!hasJoinedRoom) {
      if (players.length >= 2) {
        setPopupMessage("Room is already full. Please try again later.");
        setShowPopup(true);
        setTimeout(() => window.location.reload(), 1000);
        return;
      }

      if (isUsernameUnique(trimmedName)) {
        if (!isPracticeMode) {
          socket.emit("joinRoom", trimmedName);
        }

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
  useEffect(() => {
    if (showJoinWarning) {
      const timer = setTimeout(() => setShowJoinWarning(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showJoinWarning]);

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
      if (!isPracticeMode && socket) socket.emit("restartGame");
    }, 2000);
  }, [socket]);

  const handleInfoClick = useCallback(() => {
    setShowInfoPopup(true);
  }, []);

  const handleReady = useCallback(() => {
    if (socket) {
      if (!isPracticeMode) {
        socket.emit("playerReady", playerName);
      }
      audioPool.unlockAll();
      audioUnlockedRef.current = true;
      setIsReady(true);
    }
  }, [socket, playerName]);

  const startPracticeMode = () => {
    audioPool.unlockAll(); // ✅ Unlock all sounds
    audioPool.play("begin"); // ✅ Play "begin" sound
    setIsPracticeMode(true);
    setPlayers([
      { id: "practice-player", name: "You" },
      { id: "bot-player", name: "BOT" },
    ]);
    setShowWelcomeScreen(false);
    setIsGameStarted(true);
  };

  const onPlayerHit = useCallback(
    (data) => {
      if (winner || loser) return;
      if (!isPracticeMode) {
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
      }

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
    if (!socket || isPracticeMode) return;

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
      if (!hasJoinedRoom) {
        console.log("Ignoring startGame — not joined");
        return;
      }

      if (hasStartedGameRef.current) return;
      hasStartedGameRef.current = true;

      console.log("[Socket] startGame event received at", Date.now());

      let count = 3;
      setCountdown(count);

      const interval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count === 0) {
          clearInterval(interval);
          setShowWelcomeScreen(false);
          setIsGameStarted(true);

          const audio = bgMusicRef.current;
          if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }

          // Play start sound
          setTimeout(() => {
            try {
              audioPool.unlockAll();
              setTimeout(() => {
                if (typeof window !== "undefined") {
                  audioPool.unlockAll();
                  audioPool.play("begin");
                }
              }, 100);
            } catch (err) {
              console.warn("Audio unlock/play error on startGame", err);
            }
          }, 100);
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

  useEffect(() => {
    if (!socket || isPracticeMode) return;

    const roomStateHandler = (state) => {
      if (state?.roomId) {
        setRoomId(state.roomId); // ✅ Save the current room ID
      }

      if (Array.isArray(state.players)) {
        setPlayers(state.players);
      }

      if (typeof state.gameStarted === "boolean") {
        setIsGameStarted(state.gameStarted);
      }
    };

    socket.on("roomState", roomStateHandler);

    return () => {
      socket.off("roomState", roomStateHandler);
    };
  }, [socket, isPracticeMode]);

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
    const relink = () => {
      if (carControllerRef1.current && carControllerRef2.current) {
        carControllerRef1.current.setOpponentRef(carControllerRef2.current);
        carControllerRef2.current.setOpponentRef(carControllerRef1.current);
      }
    };

    // Relink after game starts
    if (isGameStarted) {
      const timeout = setTimeout(relink, 100); // Give refs time to mount
      return () => clearTimeout(timeout);
    }
  }, [isGameStarted, players]);

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
  // 🔁 Reset audio unlock flag so it can retry next match
  useEffect(() => {
    if (restartCountdown === 0) {
      audioUnlockedRef.current = false;
      console.log("[Audio] Unlock state reset for new match");
    }
  }, [restartCountdown]);

  const handleStart = () => {
    audioPool.unlockAll();
    setHasTappedToBegin(true);

    const audio = bgMusicRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch((e) => {
        console.warn("Autoplay failed:", e);
      });
    }
  };

  // --- Render ---
  return (
    <>
      <div ref={settingsPanelRef}>
        <Leva
          store={levaStore}
          hidden={!showSettings}
          titleBar={false}
          style={{
            position: "fixed",
            top: 96,
            right: 12,
            left: "auto",
            zIndex: 1000,
            width: 260,
            maxWidth: "90vw",
          }}
          theme={{
            sizes: {
              controlWidth: 220,
            },
          }}
        />
      </div>

      {/* ✅ Only visible when toggled */}
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
                  // 🟢 let swipe-to-turn work for you in practice too
                  swipeRotationDelta={
                    isPracticeMode
                      ? swipeRotationDelta
                      : players[0]?.id === socket?.id
                      ? swipeRotationDelta
                      : 0
                  }
                  levaStore={levaStore}
                  showSettings={showSettings}
                  ref={(el) => {
                    carControllerRef1.current = el;
                    // 🟢 make this the camera target in Practice (or when you are player 1 in multiplayer)
                    if (isPracticeMode || players[0]?.id === socket?.id) {
                      cameraToggleRef.current = el;
                    }
                  }}
                  key={players[0]?.id || "player1"}
                  playerId={players[0]?.id}
                  characterType="cena"
                  // 🟢 ALWAYS route your joystick to player 1 in Practice
                  joystickInput={
                    isPracticeMode
                      ? joystickInput
                      : players[0]?.id === socket?.id
                      ? joystickInput
                      : null
                  }
                  // 🟢 game must be started
                  disabled={!isGameStarted}
                  position={[1.2, 0, 0]}
                  // 🟢 Treat player 1 as the local driver in Practice so the camera follows you
                  isPlayer1={
                    isPracticeMode ? true : players[0]?.id === socket?.id
                  }
                  color={0x90902d}
                  // 🟢 Route buttons to you in Practice
                  isPunching={
                    isPracticeMode
                      ? isPunching
                      : players[0]?.id === socket?.id
                      ? isPunching
                      : false
                  }
                  isKicking={
                    isPracticeMode
                      ? isKicking
                      : players[0]?.id === socket?.id
                      ? isKicking
                      : false
                  }
                  health={health1}
                  opponentHealth={health2}
                  // 🟢 You are the local player in Practice
                  isLocalPlayer={
                    isPracticeMode ? true : players[0]?.id === socket?.id
                  }
                  playerName={players[0]?.name || "Player 1"}
                  opponentName={players[1]?.name || "Player 2"}
                  audio={soundsRef.current}
                  // 🟢 Practice-only local hit path
                  practiceMode={isPracticeMode}
                  onPracticeHit={(data) => {
                    // Always show hit animation on bot
                    carControllerRef2.current?.receiveHit(
                      data.attackType,
                      data.attackTime
                    );

                    setHealth2((prev) => {
                      const newHealth = Math.max(0, prev - data.damage);

                      if (newHealth === 0) {
                        // Trigger bot fall + player victory
                        setTimeout(() => {
                          carControllerRef2.current?.setDefeat(true);
                          carControllerRef1.current?.setVictory(true);
                        }, 200);

                        // Reload after short delay
                        setTimeout(() => {
                          window.location.reload();
                        }, 2500);
                      }

                      return newHealth;
                    });
                  }}
                />

                <PlayerController
                  // ❌ No swipe turning for BOT in practice
                  swipeRotationDelta={
                    isPracticeMode
                      ? 0
                      : players[1]?.id === socket?.id
                      ? swipeRotationDelta
                      : 0
                  }
                  levaStore={levaStore}
                  showSettings={showSettings}
                  ref={(el) => {
                    carControllerRef2.current = el;
                    // keep default camera assignment for multiplayer only
                    if (players[1]?.id === socket?.id && !isPracticeMode) {
                      cameraToggleRef.current = el;
                    }
                  }}
                  key={players[1]?.id || "player2"}
                  playerId={players[1]?.id}
                  characterType="austin"
                  // ❌ No joystick for BOT in practice
                  joystickInput={
                    isPracticeMode
                      ? null
                      : players[1]?.id === socket?.id
                      ? joystickInput
                      : null
                  }
                  // optional: marking disabled is fine but not strictly required
                  disabled={
                    !isGameStarted /* || (isPracticeMode ? true : false) */
                  }
                  position={[-1.2, 0, 0]}
                  // ❌ BOT is not the driving player in practice
                  isPlayer1={
                    isPracticeMode ? false : players[1]?.id === socket?.id
                  }
                  color={0x2b2ba1}
                  // ❌ No attack inputs for BOT in practice
                  isPunching={
                    isPracticeMode
                      ? false
                      : players[1]?.id === socket?.id
                      ? isPunching
                      : false
                  }
                  isKicking={
                    isPracticeMode
                      ? false
                      : players[1]?.id === socket?.id
                      ? isKicking
                      : false
                  }
                  health={health2}
                  opponentHealth={health1}
                  isLocalPlayer={
                    isPracticeMode ? false : players[1]?.id === socket?.id
                  }
                  playerName={players[1]?.name || "Player 2"}
                  opponentName={players[0]?.name || "Player 1"}
                  audio={soundsRef.current}
                  // 🟢 Practice mode flag (so it silences sockets etc.)
                  practiceMode={isPracticeMode}
                />
              </>
            )}
          </Physics>
        </Canvas>
      </KeyboardControls>
      {showWelcomeScreen && (
        <div
          className="fixed font-[Bebas] inset-0 flex items-center justify-center bg-black/95  z-50 start"
          onClick={(e) => {
            if (!hasTappedToBegin) {
              e.stopPropagation();
              handleStart();
            }
          }}
        >
          <div
            className={`text-center ${
              !hasTappedToBegin ? "pointer-events-none" : ""
            }`}
          >
            {" "}
            {/* prevent double click issues */}
            {/* Welcome Title */}
            <div
              ref={welcomeTextRef}
              className="font-[Bangers] tracking-wide sm:tracking-wider md:tracking-widest text-3xl sm:text-5xl md:text-6xl font-bold text-yellow-400 mb-8 flex justify-center transition-all duration-500"
            >
              {"Welcome to NishFight".split("").map((letter, index) => (
                <span key={index} className="inline-block">
                  {letter === " " ? "\u00A0" : letter}
                </span>
              ))}
            </div>
            {/* Tap to Begin */}
            {!hasTappedToBegin && (
              <div
                className={`text-white text-xl mt-4 ${
                  hasTappedToBegin ? "fade-out" : "animate-blink"
                }`}
              >
                Tap to Begin
              </div>
            )}
            {/* Inputs and Buttons (Hidden until tap) */}
            <div
              className={`mt-8 transition-all duration-700 ease-out ${
                hasTappedToBegin
                  ? "opacity-100 translate-y-0 animate-bounceInUp"
                  : "opacity-0 translate-y-10 pointer-events-none"
              }`}
            >
              <div>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onPointerDown={unlockAllAudio}
                  className="font-[Bebas] px-4 py-2 text-center mb-4 bg-white text-black rounded-lg"
                />
              </div>
              <div className="flex flex-col gap-4 sm:w-[70%] w-[80%] mx-auto font-[Bebas]">
                <button
                  ref={joinBtnRef}
                  onClick={() => {
                    const trimmedName = playerName.trim();
                    if (
                      hasJoinedRoom ||
                      !isUsernameValid ||
                      trimmedName.length === 0
                    ) {
                      setShowJoinWarning(true);
                      nameInputRef.current?.focus();
                      return;
                    }
                    handleJoinRoom();
                  }}
                  onPointerDown={unlockAllAudio}
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

                {showJoinWarning && (
                  <div className="text-yellow-300 text-center mt-2 text-lg animate-pulse">
                    Please enter your name to join
                  </div>
                )}

                <button
                  onClick={startPracticeMode}
                  className="px-8 py-2 font-choco tracking-widest bg-green-600 text-white sm:text-2xl text-3xl font-bold rounded-lg hover:bg-green-700 transition-colors"
                >
                  PRACTICE
                </button>
              </div>
              <div
                onClick={handleInfoClick}
                className="font-[Bebas] mt-4 py-2 font-choco text-white sm:text-2xl text-3xl tracking-widest cursor-pointer bg-blue-500 hover:bg-blue-600 sm:w-[70%] w-[80%] mx-auto rounded-lg transition-colors"
              >
                HOW TO PLAY?
              </div>
            </div>
          </div>
        </div>
      )}

      {!isPracticeMode && hasJoinedRoom && !isGameStarted && (
        <div className="font-[Bebas] fixed bottom-5 right-5 bg-black bg-opacity-50 text-white p-4 rounded-lg z-[100]">
          <h3>Lobby</h3>
          {players.map((player, index) => (
            <div key={index}>
              {player.name} {player.isReady ? "✅" : "❌"}
            </div>
          ))}
          {!isPracticeMode && players.length === 2 && !isReady && (
            <button
              onClick={handleReady}
              className="mt-2 px-4 py-2 bg-green-500 text-white rounded-lg"
            >
              READY
            </button>
          )}
        </div>
      )}
      {!isPracticeMode && countdown !== null && !isGameStarted && (
        <div className="fixed inset-0 flex items-center justify-center z-[101]">
          <div className="w-[80vw] h-[80vw] rounded-full bg-black text-white text-9xl flex items-center justify-center">
            {countdown}
          </div>
        </div>
      )}
      {hasJoinedRoom &&
        !isPracticeMode &&
        (countdown === null || isGameStarted) && (
          <div className="fixed top-[40%] left-5 z-[999] fade-in-slide">
            <button
              onClick={() => {
                if (socket) {
                  socket.emit("playerLeft", { playerId: socket.id });
                }
                window.location.reload();
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
            >
              Exit
            </button>
          </div>
        )}

      {isGameStarted && (
        <div className="fixed font-[Bebas] top-0 left-0 right-0 flex justify-between p-4 z-50">
          {isPracticeMode && isGameStarted && (
            <button
              onClick={() => window.location.reload()}
              className="fixed top-20 left-5 px-4 py-2 bg-red-600 text-white rounded-lg z-50"
            >
              Exit Practice
            </button>
          )}

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
        ref={joystickRef} // ✅ attach ref here
        onToggleCamera={() => cameraToggleRef.current?.toggleFppTpp()}
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
          key={localPlayer?.id || playerName} // 👈 unique per match or player
          onPunch={setIsPunching}
          onKick={setIsKicking}
        />
      )}
      <Info
        settingsButtonRef={settingsButtonRef}
        toggleSettings={toggleSettings}
        onReset={handleReset}
        showPopup={showPopup}
        popupMessage={popupMessage}
        showInfoPopup={showInfoPopup}
        setShowInfoPopup={setShowInfoPopup}
        onInfoClick={
          isPracticeMode ? () => setShowInfoPopup((prev) => !prev) : null // 🔒 don't show button outside practice
        }
      />

      <button
        onClick={() => {
          const audio = bgMusicRef.current;
          if (!audio) return;

          if (isMusicPlaying) {
            audio.pause();
            audio.currentTime = 0;
          } else {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }

          setIsMusicPlaying(!isMusicPlaying);
        }}
        className="fixed top-[15%] right-3 z-[9999] p-2 bg-black/60 rounded-full text-white"
      >
        {isMusicPlaying ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a9 9 0 010 12.73" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path d="M9.25 9.25L4 14.5h4l5 4V5l-5 4H4l5.25 5.25M16 12h.01M19 9l-3 3 3 3" />
          </svg>
        )}
      </button>

      <audio ref={bgMusicRef} src="/bgmusic.mp3" loop preload="auto" />
    </>
  );
};

export default Experience;
