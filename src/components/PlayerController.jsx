import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { MathUtils } from "three/src/math/MathUtils";
import { useSocket } from "../context/SocketContext";
import Stone from "./Stone";
import Cenaa from "./Cenaa";

const SOUNDS = {
  punch: "/punch.mp3",
  kick: "/kick.mp3",
  hit: "/hit.mp3",
  victory: "/victory.mp3",
  lost: "/lost.mp3",
};

const isIOS = () => {
  return (
    typeof window !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );
};

const PlayerController = forwardRef(
  (
    {
      joystickInput,
      position,
      isPlayer1,
      color,
      isPunching,
      isKicking,
      characterType,
      health,
      opponentHealth,
      playerName,
      opponentName,
      isLocalPlayer,
      connectionQuality,
    },
    ref
  ) => {
    const socket = useSocket();
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
    const [currentAnimation, setCurrentAnimation] = useState("idle");
    const [isAttacking, setIsAttacking] = useState(false);
    const [isHit, setIsHit] = useState(false);
    const [isDefeated, setIsDefeated] = useState(false);
    const [matchResult, setMatchResult] = useState(null);
    const [lastAttackTime, setLastAttackTime] = useState(0);
    const [lastHitTime, setLastHitTime] = useState(0);
    const [audioContext, setAudioContext] = useState(null);
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);
    const opponentAttackTime = useRef(0);
    const hasEmittedDefeat = useRef(false);
    const opponentIdRef = useRef(null);

    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);
    const lastJoystickMagnitude = useRef(0);
    const joystickChangeThreshold = 0.05;

    const punchSound = useRef(null);
    const kickSound = useRef(null);
    const hitSound = useRef(null);
    const victorySound = useRef(null);
    const lostSound = useRef(null);

    const WALK_SPEED = connectionQuality === "low" ? 1.2 : 1.5;
    const RUN_SPEED = connectionQuality === "low" ? 2.0 : 2.5;
    const ROTATION_SPEED = isSmallScreen ? 0.06 : 0.04;

    const rb = useRef();
    const container = useRef();
    const character = useRef();
    const rotationTarget = useRef(0);
    const cameraTarget = useRef();
    const cameraPosition = useRef();
    const cameraworldPosition = useRef(new Vector3());
    const cameraLookAtWorldPosition = useRef(new Vector3());
    const cameraLookAt = useRef(new Vector3());
    const [, get] = useKeyboardControls();
    const movementEnabled = useRef(true);

    // Initialize audio context
    const initAudio = () => {
      if (
        !audioContext &&
        typeof window !== "undefined" &&
        window.AudioContext
      ) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);
      }
    };

    // Play sound with iOS fallback
    const playSound = (soundRef) => {
      if (soundRef.current) {
        // On iOS, we need to ensure the audio context is resumed
        if (audioContext?.state === "suspended") {
          audioContext
            .resume()
            .catch((e) => console.log("Audio resume failed:", e));
        }

        soundRef.current.currentTime = 0;
        soundRef.current.play().catch((e) => {
          console.log("Audio play failed, trying fallback:", e);
          // Fallback for iOS - create a new audio element
          const newAudio = new Audio(soundRef.current.src);
          newAudio.volume = soundRef.current.volume;
          newAudio
            .play()
            .catch((e) => console.log("Fallback audio failed:", e));
        });
      }
    };

    useEffect(() => {
      opponentIdRef.current = opponentRef.current?.id;
    }, [opponentRef.current?.id]);

    useEffect(() => {
      punchSound.current = new Audio(SOUNDS.punch);
      kickSound.current = new Audio(SOUNDS.kick);
      hitSound.current = new Audio(SOUNDS.hit);
      victorySound.current = new Audio(SOUNDS.victory);
      lostSound.current = new Audio(SOUNDS.lost);

      punchSound.current.volume = 0.7;
      kickSound.current.volume = 0.7;
      hitSound.current.volume = 0.4;
      victorySound.current.volume = 0.8;
      lostSound.current.volume = 0.8;

      // Initialize audio on first interaction
      const handleFirstInteraction = () => {
        initAudio();
        window.removeEventListener("touchstart", handleFirstInteraction);
        window.removeEventListener("click", handleFirstInteraction);
      };

      window.addEventListener("touchstart", handleFirstInteraction, {
        once: true,
      });
      window.addEventListener("click", handleFirstInteraction, { once: true });

      return () => {
        window.removeEventListener("touchstart", handleFirstInteraction);
        window.removeEventListener("click", handleFirstInteraction);

        [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
          (soundRef) => {
            if (soundRef.current) {
              soundRef.current.pause();
              soundRef.current.src = "";
              soundRef.current.remove();
              soundRef.current = null;
            }
          }
        );
      };
    }, []);

    useEffect(() => {
      const handleResize = () => {
        setIsSmallScreen(window.innerWidth < 640);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    const setOpponentRef = (ref) => {
      opponentRef.current = ref;
    };

    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;

      const damage = type === "kick" ? 20 : 10;
      const currentTime = Date.now();
      setLastAttackTime(currentTime);

      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
      }

      // Play sound using our new playSound function
      if (type === "punch") {
        playSound(punchSound);
      } else if (type === "kick") {
        playSound(kickSound);
      }

      setIsAttacking(true);
      movementEnabled.current = false;
      setCurrentAnimation(type);

      if (
        isInContact &&
        socket &&
        opponentRef.current &&
        !opponentRef.current.isDefeated
      ) {
        socket.emit("playerHit", {
          attackerId: socket.id,
          damage: damage,
          attackType: type,
          attackTime: currentTime,
        });
      }

      const duration = 1000;
      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = !isDefeated;
        setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, duration);
    };

    const takeHit = (attackType, attackTime) => {
      const now = Date.now();

      // Skip if we're already in hit state or recently hit
      if (isHit || isDefeated || now - lastHitTime < 300) return;
      if (attackTime <= lastAttackTime) return;

      setLastHitTime(now);

      // Force animation update even if audio fails
      setIsHit(true);
      setCurrentAnimation("hit");

      // Try to play sound but don't depend on it
      playSound(hitSound);

      // Clear any existing timer
      if (hitTimer.current) clearTimeout(hitTimer.current);

      hitTimer.current = setTimeout(() => {
        setIsHit(false);
        if (!isAttacking) {
          setCurrentAnimation(isDefeated ? "fall" : "idle");
        }
      }, 1000);
    };

    const handleCollisionEnter = (event) => {
      if (!opponentRef.current || !rb.current) return;

      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        setIsInContact(true);
        if (contactTimeout.current) {
          clearTimeout(contactTimeout.current);
        }

        console.log("Collision entered with:", {
          self: rb.current?.userData?.id,
          other: otherUserData?.id,
          time: Date.now(),
          isLocalPlayer,
        });
      }
    };

    const handleCollisionExit = (event) => {
      if (!opponentRef.current || !rb.current) return;

      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        contactTimeout.current = setTimeout(() => {
          setIsInContact(false);
        }, 50);
      }
    };

    useEffect(() => {
      if (isPunching && !isHit) startAttack("punch");
      if (isKicking && !isHit) startAttack("kick");
    }, [isPunching, isKicking]);

    useEffect(() => {
      if (health <= 0 && !isDefeated && socket && opponentRef.current) {
        setIsDefeated(true);
        setCurrentAnimation("fall");
        movementEnabled.current = false;

        if (!hasEmittedDefeat.current) {
          hasEmittedDefeat.current = true;
          console.log(`Emitting defeat - 
        Winner: ${opponentRef.current.id}, 
        Loser: ${socket.id},
        WinnerHealth: ${opponentHealth},
        LoserHealth: ${health}`);

          socket.emit("playerDefeated", {
            winnerId: opponentRef.current.id,
            loserId: socket.id,
            winnerHealth: opponentHealth,
            loserHealth: health,
            winningAttackTime: opponentAttackTime.current,
          });
        }
      }
    }, [health, isDefeated, opponentHealth, socket]);

    useEffect(() => {
      if (!socket) return;

      const onPlayerHit = (data) => {
        console.log("onPlayerHit received", data);
        if (data.attackerId !== socket.id) {
          takeHit(data.attackType, data.attackTime);
        }
      };

      socket.on("playerHit", onPlayerHit);

      return () => {
        socket.off("playerHit", onPlayerHit);
      };
    }, [socket]);

    useFrame(({ camera }) => {
      if (!rb.current || !isPlayer1 || isDefeated) return;

      const vel = rb.current.linvel();
      const movement = { x: 0, z: 0 };
      const isUsingJoystick =
        joystickInput &&
        (Math.abs(joystickInput.x) > 0.1 || Math.abs(joystickInput.y) > 0.1);
      const { forward, backward, left, right, run, punch, kick } = get();

      if (punch && !isAttacking && !isHit) startAttack("punch");
      if (kick && !isAttacking && !isHit) startAttack("kick");

      if (movementEnabled.current && !isHit) {
        if (forward) {
          movement.z = run ? -RUN_SPEED : -WALK_SPEED;
          if (!isAttacking) setCurrentAnimation(run ? "run" : "walk");
        } else if (backward) {
          movement.z = 0;
          if (!isAttacking) setCurrentAnimation("idle");
        } else {
          if (!isAttacking && !isHit) setCurrentAnimation("idle");
        }

        if (joystickInput) {
          const joystickMagnitude = Math.sqrt(
            joystickInput.x * joystickInput.x +
              joystickInput.y * joystickInput.y
          );

          if (
            Math.abs(joystickMagnitude - lastJoystickMagnitude.current) >
            joystickChangeThreshold
          ) {
            lastJoystickMagnitude.current = joystickMagnitude;
          }

          if (joystickMagnitude > 0.1) {
            if (Math.abs(joystickInput.x) > 0.1) {
              rotationTarget.current += ROTATION_SPEED * joystickInput.x;
            }

            if (joystickInput.y < 0) {
              movement.z = joystickInput.isRunning ? -RUN_SPEED : -WALK_SPEED;
              if (!isAttacking)
                setCurrentAnimation(joystickInput.isRunning ? "run" : "walk");
            } else if (joystickInput.y > 0) {
              movement.z = 0;
              if (!isAttacking) setCurrentAnimation("idle");
            }
          }
        }

        if (left) movement.x = 1;
        if (right) movement.x = -1;
      }

      if (movement.x !== 0 && movementEnabled.current && !isHit) {
        rotationTarget.current += ROTATION_SPEED * movement.x;
      }

      if (movementEnabled.current && !isHit) {
        if (isUsingJoystick && joystickInput.y < 0) {
          const moveDirection = new Vector3(
            Math.sin(rotationTarget.current),
            0,
            Math.cos(rotationTarget.current)
          ).normalize();
          vel.x =
            moveDirection.x *
            (joystickInput.isRunning ? -RUN_SPEED : -WALK_SPEED);
          vel.z =
            moveDirection.z *
            (joystickInput.isRunning ? -RUN_SPEED : -WALK_SPEED);
        } else if (movement.x !== 0 || movement.z !== 0) {
          vel.x = Math.sin(rotationTarget.current) * movement.z;
          vel.z = Math.cos(rotationTarget.current) * movement.z;
        }
      }

      rb.current.setLinvel(vel, true);

      if (socket && !isDefeated) {
        socket.emit("carMove", {
          position: rb.current.translation(),
          rotation: container.current.rotation.y,
          isPlayer1,
          animation: currentAnimation,
          isAttacking,
          isHit,
          health,
        });
      }

      if (isPlayer1) {
        container.current.rotation.y = MathUtils.lerp(
          container.current.rotation.y,
          rotationTarget.current,
          0.1
        );
        cameraPosition.current.getWorldPosition(cameraworldPosition.current);
        camera.position.lerp(cameraworldPosition.current, 0.1);
        if (cameraTarget.current) {
          cameraTarget.current.getWorldPosition(
            cameraLookAtWorldPosition.current
          );
          cameraLookAt.current.lerp(cameraLookAtWorldPosition.current, 0.1);
          camera.lookAt(cameraLookAt.current);
        }
      }
    });

    useEffect(() => {
      if (!socket) return;

      const onCarMove = (data) => {
        if (data.isPlayer1 !== isPlayer1) {
          rb.current.setTranslation(data.position);
          container.current.rotation.y = data.rotation;
          setCurrentAnimation(data.animation || "idle");
          setIsAttacking(data.isAttacking || false);
          setIsHit(data.isHit || false);
        }
      };

      socket.on("carMove", onCarMove);
      return () => socket.off("carMove", onCarMove);
    }, [socket, isPlayer1]);

    useImperativeHandle(ref, () => ({
      setOpponentRef,

      setVictory: (isLocalPlayerWinner) => {
        setMatchResult("won");
        setCurrentAnimation("victory");
        movementEnabled.current = false;

        setTimeout(() => {
          if (isLocalPlayerWinner) {
            playSound(victorySound);
          }
        }, 100);
      },

      setDefeat: (isLocalPlayerLoser) => {
        setMatchResult("lost");
        setCurrentAnimation("fall");
        movementEnabled.current = false;

        setTimeout(() => {
          if (isLocalPlayerLoser) {
            playSound(lostSound);
          }
        }, 200);
      },
      translation: () => rb.current?.translation(),
      id: socket?.id,
      rigidBody: rb.current,
      isDefeated,
    }));

    useEffect(() => {
      return () => {
        if (attackTimer.current) clearTimeout(attackTimer.current);
        if (hitTimer.current) clearTimeout(hitTimer.current);
        if (contactTimeout.current) clearTimeout(contactTimeout.current);

        [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
          (sound) => {
            if (sound.current) {
              sound.current.pause();
              sound.current = null;
            }
          }
        );
      };
    }, []);

    return (
      <RigidBody
        colliders={false}
        lockRotations
        ref={rb}
        gravityScale={9}
        onCollisionEnter={handleCollisionEnter}
        onCollisionExit={handleCollisionExit}
        userData={{
          id: socket?.id,
          isPlayer: true,
        }}
        solverIterations={10}
        ccd={true}
        linearDamping={0.5}
        angularDamping={1.0}
        sleepAfterStillness={0.2}
        canSleep={true}
      >
        <group ref={container} position={position}>
          <group ref={cameraTarget} position-z={-5.5} rotation-y={Math.PI} />
          <group ref={cameraPosition} position-y={4.5} position-z={2.5} />
          <group ref={character} rotation-y={Math.PI} castShadow receiveShadow>
            {characterType === "cena" ? (
              <Cenaa
                scale={isSmallScreen ? 2.7 : 3.18}
                position-y={-0.25}
                color={color}
                castShadow
                animation={
                  matchResult === "won"
                    ? "victory"
                    : matchResult === "lost"
                    ? "fall"
                    : isHit
                    ? "hit"
                    : currentAnimation
                }
              />
            ) : (
              <Stone
                scale={isSmallScreen ? 2.7 : 3.18}
                position-y={-0.25}
                color={color}
                castShadow
                animation={
                  matchResult === "won"
                    ? "victory"
                    : matchResult === "lost"
                    ? "fall"
                    : isHit
                    ? "hit"
                    : currentAnimation
                }
              />
            )}
            <CapsuleCollider
              args={[0.4, 0.3]}
              position={[0, 3, 0]}
              restitution={0.1}
              friction={0.5}
            />
            <CapsuleCollider
              args={[0.4, 0.4]}
              position={[0, 3, 0]}
              sensor
              onIntersectionEnter={handleCollisionEnter}
              onIntersectionExit={handleCollisionExit}
            />
          </group>
        </group>
      </RigidBody>
    );
  }
);

export default PlayerController;
