import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { Vector3 } from "three";
import { CircleGeometry, MeshBasicMaterial, Mesh } from "three";
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

    const WALK_SPEED = 1.5;
    const RUN_SPEED = 2.5;
    const ROTATION_SPEED = isSmallScreen ? 0.06 : 0.04;

    // --- Attack ring config (shared by logic + visuals) ---
    const ATTACK_RADIUS = 0; // tweak to adjust required distance
    const RING_Y = 2.5; // slightly above floor to avoid z-fighting

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

    // Debug ring refs
    const DEBUG_HIT_RANGE = true;
    const debugRangeRef = useRef();
    const debugMaterialRef = useRef();

    // Track opponent id (for logging)
    useEffect(() => {
      opponentIdRef.current = opponentRef.current?.id;
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
    };

    // 2D distance + "ring contact" helper (uses same ATTACK_RADIUS for both players)
    const distance2D = (a, b) => {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      return Math.sqrt(dx * dx + dz * dz);
    };

    const ringsInContact = () => {
      if (!opponentRef.current || !rb.current) return false;
      const selfPos = rb.current.translation?.();
      const otherPos = opponentRef.current.translation?.();
      if (!selfPos || !otherPos) return false;

      // Same radius both sides → contact when distance ≤ 2R
      return distance2D(selfPos, otherPos) <= ATTACK_RADIUS * 2;
    };

    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;

      if (rb.current && opponentRef.current) {
        const selfPos = rb.current.translation?.();
        const otherPos = opponentRef.current.translation?.();

        if (selfPos && otherPos) {
          const dx = selfPos.x - otherPos.x;
          const dz = selfPos.z - otherPos.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          console.log(
            `[${type.toUpperCase()}] Distance to opponent:`,
            distance.toFixed(2)
          );
          console.log(
            `[${type.toUpperCase()}] Is in range:`,
            distance <= ATTACK_RADIUS * 2
          );
        }
      }

      const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const damage = type === "kick" ? 20 : 10;
      const currentTime = Date.now();
      setLastAttackTime(currentTime);

      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
      }

      const sound = type === "kick" ? kickSound.current : punchSound.current;
      if (sound) {
        sound.currentTime = 0;
        sound.play().catch((e) => console.log("Audio play failed:", e));
      }

      setIsAttacking(true);
      movementEnabled.current = false;
      setCurrentAnimation(type);

      // ✅ Physics Nudge for iOS (does not override contact logic)
      if (isiOS && rb.current) {
        const vel = rb.current.linvel();
        const forwardNudge = new Vector3(
          Math.sin(rotationTarget.current),
          0.02, // slight vertical bump
          Math.cos(rotationTarget.current)
        )
          .normalize()
          .multiplyScalar(0.05); // minimal forward push

        vel.x += forwardNudge.x;
        vel.y += forwardNudge.y;
        vel.z += forwardNudge.z;

        rb.current.setLinvel(vel, true);
      }

      if (
        (isInContact || ringsInContact()) &&
        socket &&
        opponentRef.current &&
        !opponentRef.current?.isDefeated
      ) {
        socket.emit("playerHit", {
          attackerId: socket.id,
          damage,
          attackType: type,
          attackTime: currentTime,
        });
      }

      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = !isDefeated;
        setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, 1000);
    };

    const takeHit = (attackType, attackTime) => {
      if (isHit || isDefeated) return;

      // Accept the hit; timestamp is for attribution/logging only
      opponentAttackTime.current = attackTime ?? Date.now();

      if (hitSound.current) {
        hitSound.current.currentTime = 0;
        hitSound.current.play().catch(() => {
          // iOS can block audio the first time; animation still runs
        });
      }

      if (hitTimer.current) {
        clearTimeout(hitTimer.current);
      }

      setIsHit(true);
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
      if (!opponentRef.current || !rb.current) return;

      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        setIsInContact(true);
        if (contactTimeout.current) {
          clearTimeout(contactTimeout.current);
        }
      }
    };

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
        if (data.victimId === playerId) {
          // precise match
          takeHit(data.attackType, data.attackTime);
        }
      };

      socket.on("playerHit", onPlayerHit);

      return () => {
        socket.off("playerHit", onPlayerHit);
      };
    }, [socket]);

    useEffect(() => {
      if (!socket) return;

      const handleStartGame = () => {
        setIsDefeated(false);
        setMatchResult(null);
        setCurrentAnimation("idle");
        setIsHit(false);
        setIsAttacking(false);
        hasEmittedDefeat.current = false;
        movementEnabled.current = true;
        opponentAttackTime.current = 0;

        if (character.current?.resetAnimation) {
          character.current.resetAnimation();
        }
      };

      socket.on("startGame", handleStartGame);
      return () => socket.off("startGame", handleStartGame);
    }, [socket]);

    // --- Debug range (visual) ---
    useEffect(() => {
      if (!DEBUG_HIT_RANGE || !container.current) return;

      const geometry = new CircleGeometry(ATTACK_RADIUS, 48);
      const material = new MeshBasicMaterial({
        color: 0xff0000,
        opacity: 0.25,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      debugMaterialRef.current = material;

      const mesh = new Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2; // lay flat
      mesh.position.set(0, RING_Y, 0); // center on player, slightly above floor
      mesh.renderOrder = 9999; // draw on top

      container.current.add(mesh);
      debugRangeRef.current = mesh;

      return () => {
        if (container.current && debugRangeRef.current) {
          container.current.remove(debugRangeRef.current);
        }
        geometry.dispose();
        material.dispose();
      };
    }, []);

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

      // --- Live color feedback for ring contact (red → out, green → in) ---
      if (DEBUG_HIT_RANGE && debugMaterialRef.current && opponentRef.current) {
        const mine = rb.current?.translation?.();
        const theirs = opponentRef.current.translation?.();
        if (mine && theirs) {
          const inRange = distance2D(mine, theirs) <= ATTACK_RADIUS * 2;
          debugMaterialRef.current.color.set(inRange ? 0x00ff00 : 0xff0000);
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
