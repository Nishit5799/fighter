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
  kick: "/punch.mp3",
  hit: "/hit.mp3",
  victory: "/victory.mp3",
  lost: "/lost.mp3",
};

const PlayerController = forwardRef(
  (
    {
      playerId,
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
    },
    ref
  ) => {
    // --- Context / state ---
    const socket = useSocket();
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
    const [currentAnimation, setCurrentAnimation] = useState("idle");
    const [isAttacking, setIsAttacking] = useState(false);
    const [isHit, setIsHit] = useState(false);
    const [isDefeated, setIsDefeated] = useState(false);
    const [matchResult, setMatchResult] = useState(null);
    const [lastAttackTime, setLastAttackTime] = useState(0);

    // --- Refs ---
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);

    // Keep for defeat attribution only; don't use it to reject hits
    const opponentAttackTime = useRef(0);

    const hasEmittedDefeat = useRef(false);
    const opponentIdRef = useRef(null);
    const lastCollisionTime = useRef(0);
    const recentCollisions = useRef(new Set());
    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);
    const lastJoystickMagnitude = useRef(0);
    const joystickChangeThreshold = 0.05;
    const [, forceRerender] = useState(0);

    const punchSound = useRef(null);
    const kickSound = useRef(null);
    const hitSound = useRef(null);
    const victorySound = useRef(null);
    const lostSound = useRef(null);

    const WALK_SPEED = 1.5;
    const RUN_SPEED = 2.5;
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

    useEffect(() => {
      recentCollisions.current.clear();
      setIsInContact(false);

      const tryEmitCollision = () => {
        if (
          rb.current &&
          opponentRef.current &&
          typeof rb.current.translation === "function" &&
          typeof opponentRef.current.translation === "function"
        ) {
          const myPos = rb.current.translation();
          const theirPos = opponentRef.current.translation();
          const distance = myPos.distanceTo(theirPos);

          if (distance < 2) {
            const collisionData = {
              self: rb.current?.userData?.id || playerId,
              other: opponentRef.current?.id,
              time: Date.now(),
              matchId: playerId,
              isLocalPlayer,
            };
            socket.emit("playerCollision", collisionData);
            console.log("🟢 Force-sent initial collision");
            return true;
          }
        }
        return false;
      };

      let retries = 0;
      const maxRetries = 20;

      const interval = setInterval(() => {
        if (tryEmitCollision() || retries >= maxRetries) {
          clearInterval(interval);
        }
        retries++;
      }, 250);
    }, [playerId]);

    // Track opponent id (for logging)
    // Inside useEffect
    useEffect(() => {
      if (opponentRef.current?.id) {
        opponentIdRef.current = opponentRef.current.id;
      }
    }, [opponentRef.current?.id]);

    // Init / teardown sounds
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

      return () => {
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

    // Responsive screen check
    useEffect(() => {
      const handleResize = () => {
        setIsSmallScreen(window.innerWidth < 640);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    // --- Helpers / Handlers ---
    const setOpponentRef = (ref) => {
      opponentRef.current = ref;
      if (ref?.id) {
        opponentIdRef.current = ref.id;
      }
    };

    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;

      const damage = type === "kick" ? 20 : 10;
      const currentTime = Date.now();
      setLastAttackTime(currentTime);

      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
      }

      if (type === "punch" && punchSound.current) {
        punchSound.current.currentTime = 0;
        punchSound.current
          .play()
          .catch((e) => console.log("Audio play failed:", e));
      } else if (type === "kick" && kickSound.current) {
        kickSound.current.currentTime = 0;
        kickSound.current
          .play()
          .catch((e) => console.log("Audio play failed:", e));
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
          attackTime: currentTime, // informational only; not used to reject hits
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
      if (isDefeated) return;

      if (isHit) {
        clearTimeout(hitTimer.current);
      }

      opponentAttackTime.current = attackTime ?? Date.now();

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }
        }
      } catch (e) {
        console.warn("AudioContext resume failed:", e);
      }

      if (hitSound.current) {
        hitSound.current.currentTime = 0;
        hitSound.current.play().catch(() => {
          console.log("iOS blocked audio, still animating hit");
        });
      }

      setIsHit(true);
      forceRerender((n) => n + 1);
      setCurrentAnimation("hit");

      if (character.current?.playHitSound) {
        character.current.playHitSound();
      }

      const duration = 1000;
      hitTimer.current = setTimeout(() => {
        setIsHit(false);
        if (!isAttacking) {
          setCurrentAnimation(isDefeated ? "fall" : "idle");
        }
      }, duration);
    };

    const handleCollisionEnter = (event) => {
      {
        const now = Date.now();

        if (!opponentRef.current || !rb.current) return;
        if (!socket) return;

        const otherUserData = event.other.rigidBody?.userData;
        if (!otherUserData?.isPlayer) return;

        const pairKey = [rb.current.userData?.id, otherUserData.id]
          .sort()
          .join("-");

        if (!recentCollisions.current.has(pairKey)) {
          recentCollisions.current.add(pairKey);

          const collisionData = {
            self: rb.current?.userData?.id,
            other: otherUserData?.id,
            time: now,
            matchId: playerId,
            isLocalPlayer,
          };

          socket.emit("playerCollision", collisionData); // ✅ emit regardless of local/remote
        }

        setIsInContact(true);
      }

      const handleCollisionExit = (event) => {
        if (!opponentRef.current || !rb.current) return;

        const otherUserData = event.other.rigidBody?.userData;
        if (otherUserData?.isPlayer) {
          contactTimeout.current = setTimeout(() => {
            setIsInContact(false);
          }, 500);
        }
      };

      // --- Effects depending on helpers ---
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
            //   console.log(`Emitting defeat -
            // Winner: ${opponentRef.current.id},
            // Loser: ${socket.id},
            // WinnerHealth: ${opponentHealth},
            // LoserHealth: ${health}`);

            if (opponentIdRef.current && opponentIdRef.current !== socket.id) {
              socket.emit("playerDefeated", {
                winnerId: opponentIdRef.current,
                loserId: socket.id,
                winnerHealth: opponentHealth,
                loserHealth: health,
                winningAttackTime: opponentAttackTime.current,
              });
            }
            // else {
            //   console.error("Invalid opponent ID at defeat time:", {
            //     opponentId: opponentIdRef.current,
            //     selfId: socket.id,
            //   });
            // }
          }
        }
      }, [health, isDefeated, opponentHealth, socket]);

      useEffect(() => {
        if (!socket) return;

        const onPlayerHit = (data) => {
          // console.log("onPlayerHit received", data);
          if (data.victimId === playerId) {
            takeHit(data.attackType, data.attackTime);
          }
        };

        socket.on("playerHit", onPlayerHit);

        return () => {
          socket.off("playerHit", onPlayerHit);
        };
      }, [socket]);

      // --- Frame loop ---
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

      // --- Socket move sync (remote) ---
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

      // --- Imperative API ---
      useImperativeHandle(ref, () => wrapper);

      // Keep the object literal separate so we don’t capture stale refs above
      const wrapper = {
        setOpponentRef,

        setVictory: (isLocalPlayerWinner) => {
          setMatchResult("won");
          setCurrentAnimation("victory");
          movementEnabled.current = false;

          setTimeout(() => {
            if (isLocalPlayerWinner && victorySound.current) {
              victorySound.current.currentTime = 0;
              victorySound.current
                .play()
                .catch((e) => console.log("Victory sound error:", e));
            }
          }, 100);
        },

        setDefeat: (isLocalPlayerLoser) => {
          setMatchResult("lost");
          setCurrentAnimation("fall");
          movementEnabled.current = false;

          setTimeout(() => {
            if (isLocalPlayerLoser && lostSound.current) {
              lostSound.current.currentTime = 0;
              lostSound.current
                .play()
                .catch((e) => console.log("Lost sound error:", e));
            }
          }, 200);
        },
        translation: () => rb.current?.translation(),
        id: socket?.id,
        rigidBody: rb.current,
        isDefeated,
      };

      // Cleanup timeouts and audio refs on unmount
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

      // --- Render ---
      return (
        <RigidBody
          colliders={false}
          lockRotations
          ref={rb}
          gravityScale={9}
          onCollisionEnter={handleCollisionEnter}
          onCollisionExit={handleCollisionExit}
          userData={{
            id: playerId, // instead of socket?.id
            isPlayer: true,
          }}
          solverIterations={10}
          ccd={true}
          linearDamping={0.5}
          angularDamping={1.0}
          sleepAfterStillness={0}
          canSleep={false}
        >
          <group ref={container} position={position}>
            <group ref={cameraTarget} position-z={-5.5} rotation-y={Math.PI} />
            <group ref={cameraPosition} position-y={4.5} position-z={2.5} />
            <group
              ref={character}
              rotation-y={Math.PI}
              castShadow
              receiveShadow
            >
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
    };
  }
);

export default PlayerController;
