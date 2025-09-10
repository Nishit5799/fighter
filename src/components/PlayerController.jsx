import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { Vector3, Box3 } from "three";
import { CircleGeometry, MeshBasicMaterial, Mesh } from "three";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls, Html } from "@react-three/drei";
import { MathUtils } from "three/src/math/MathUtils";
import { useSocket } from "../context/SocketContext";

import Stone from "./Stone";
import Cenaa from "./Cenaa";
import { Leva, useControls } from "leva";

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
      audio,
      showSettings,
      levaStore,
      swipeRotationDelta,
      practiceMode = false,
      onPracticeHit, // only used when practiceMode === true
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
    const [showDebug, setShowDebug] = useState(true);

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
    const joystickRotationSpeed = 0.01;

    const { rotationSpeed } = useControls(
      {
        rotationSpeed: {
          value: 7,
          min: 5,
          max: 23,
          step: 1,
        },
      },
      { store: levaStore }
    );

    // --- Attack ring config (shared by logic + visuals) ---
    const [attackRadius, setAttackRadius] = useState(1.2); // fallback
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
    const mainCameraRef = useRef(null);

    // Debug ring refs
    const DEBUG_HIT_RANGE = true;
    const debugRangeRef = useRef();
    const debugMaterialRef = useRef();
    const distanceLabelRef = useRef(null);

    // Track opponent id (for logging)
    useEffect(() => {
      opponentIdRef.current = opponentRef.current?.id;
    }, [opponentRef.current?.id]);

    // Init / teardown sounds
    useEffect(() => {
      // If Experience provided shared, unlocked audio, use it
      if (
        audio?.punch &&
        audio?.kick &&
        audio?.hit &&
        audio?.victory &&
        audio?.lost
      ) {
        punchSound.current = audio.punch;
        kickSound.current = audio.kick;
        hitSound.current = audio.hit;
        victorySound.current = audio.victory;
        lostSound.current = audio.lost;
        return; // Experience owns lifecycle; no teardown here
      }

      // Fallback (only if audio prop is missing)
      const make = (src, vol = 0.8) => {
        const a = new Audio(src);
        // @ts-ignore
        a.playsInline = true;
        a.preload = "auto";
        a.volume = vol;
        return a;
      };

      punchSound.current = make("/punch.mp3", 0.7);
      kickSound.current = make("/kick.mp3", 0.7);
      hitSound.current = make("/hit.mp3", 0.4);
      victorySound.current = make("/victory.mp3", 0.85);
      lostSound.current = make("/lost.mp3", 0.85);

      return () => {
        // clean up only if we created local elements
        [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
          (r) => {
            try {
              if (
                r.current &&
                (!audio || !Object.values(audio).includes(r.current))
              ) {
                r.current.pause();
                r.current.src = "";
                r.current.remove?.();
              }
            } catch {}
            r.current = null;
          }
        );
      };
    }, [audio]);

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

    useEffect(() => {
      if (!character.current) return;

      const box = new Box3().setFromObject(character.current);
      const size = box.getSize(new Vector3());

      const reach = Math.max(size.x, size.z) * 0.5 + 0.1; // add padding
      console.log("Calculated attackRadius from model:", reach.toFixed(2));

      setAttackRadius(reach);
    }, [characterType]);

    // 2D distance + "ring contact" helper (uses same ATTACK_RADIUS for both players)
    const groundDistance = (a, b) => {
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      return Math.sqrt(dx * dx + dz * dz);
    };
    const edgeDistance = (a, b, isPlayer1) => {
      const centerDist = groundDistance(a, b);
      const separation = centerDist - attackRadius * 2;
      // separation < 0 means overlap

      // Player 1 sees +separation, Player 2 sees -separation
      return isPlayer1 ? separation : -separation;
    };

    const ringsInContact = () => {
      if (!opponentRef.current || !rb.current) return false;
      const selfPos = rb.current.translation?.();
      const otherPos = opponentRef.current.translation?.();
      if (!selfPos || !otherPos) return false;

      // Same radius both sides → contact when distance ≤ 2R
      return Math.abs(edgeDistance(selfPos, otherPos, isPlayer1)) <= 0;
    };

    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;

      if (rb.current && opponentRef.current) {
        const selfPos = rb.current.translation?.();
        const otherPos = opponentRef.current.translation?.();

        if (selfPos && otherPos) {
          const distance = edgeDistance(selfPos, otherPos);
          console.log(
            `[${type.toUpperCase()}] Edge Distance to opponent:`,
            distance.toFixed(3)
          );
          console.log(`[${type.toUpperCase()}] In range:`, distance <= 0);
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
        opponentRef.current &&
        !opponentRef.current?.isDefeated
      ) {
        if (practiceMode) {
          // 🔸 local-only path in practice
          onPracticeHit?.({
            attackType: type,
            damage,
            attackTime: currentTime,
          });
        } else if (socket) {
          // 🔹 multiplayer path as before
          socket.emit("playerHit", {
            attackerId: socket.id,
            damage,
            attackType: type,
            attackTime: currentTime,
          });
        }
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
      if (!socket || practiceMode) return;

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
    }, [socket, practiceMode]);

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

    // --- Frame loop ---
    useFrame(({ camera }) => {
      if (!rb.current || !isPlayer1 || isDefeated) return;
      if (isPlayer1) {
        mainCameraRef.current = camera;
      }

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

        // ✅ Blended joystick + swipe turning logic
        const joystickMagnitude =
          joystickInput &&
          Math.sqrt(
            joystickInput.x * joystickInput.x +
              joystickInput.y * joystickInput.y
          );

        if (
          joystickMagnitude &&
          Math.abs(joystickMagnitude - lastJoystickMagnitude.current) >
            joystickChangeThreshold
        ) {
          lastJoystickMagnitude.current = joystickMagnitude;
        }

        const joystickTurn =
          joystickInput && Math.abs(joystickInput.x) > 0.1
            ? joystickRotationSpeed * joystickInput.x
            : 0;

        const swipeTurn =
          Math.abs(swipeRotationDelta) > 0.005
            ? -joystickRotationSpeed * swipeRotationDelta * rotationSpeed
            : 0;

        rotationTarget.current += joystickTurn + swipeTurn;

        // ✅ Movement only if joystick is engaged
        if (joystickMagnitude > 0.1 && joystickInput) {
          if (joystickInput.y < 0) {
            movement.z = joystickInput.isRunning ? -RUN_SPEED : -WALK_SPEED;
            if (!isAttacking)
              setCurrentAnimation(joystickInput.isRunning ? "run" : "walk");
          } else if (joystickInput.y > 0) {
            movement.z = 0;
            if (!isAttacking) setCurrentAnimation("idle");
          }
        }

        if (left) movement.x = 1;
        if (right) movement.x = -1;
      }

      if (movement.x !== 0 && movementEnabled.current && !isHit) {
        rotationTarget.current += rotationSpeed * movement.x;
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

      if (!practiceMode && socket && !isDefeated) {
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
      if (showDebug && debugMaterialRef.current && opponentRef.current) {
        const mine = rb.current?.translation?.();
        const theirs = opponentRef.current.translation?.();
        if (mine && theirs) {
          const inRange = groundDistance(mine, theirs) <= attackRadius * 2;
          debugMaterialRef.current.color.set(inRange ? 0x00ff00 : 0xff0000);
        }
        if (showDebug && distanceLabelRef.current && mine && theirs) {
          const d = edgeDistance(mine, theirs, isPlayer1);

          // Color code based on signed distance
          if (d > 0) {
            // too far
            debugMaterialRef.current.color.set(0xff0000); // red
          } else if (d < 0) {
            // overlapping from this player's perspective
            debugMaterialRef.current.color.set(0x0000ff); // blue
          } else {
            // exactly in contact
            debugMaterialRef.current.color.set(0x00ff00); // green
          }

          // Update label text
          if (distanceLabelRef.current) {
            distanceLabelRef.current.textContent = `${
              isPlayer1 ? "P1" : "P2"
            } dist: ${d.toFixed(2)} | R: ${attackRadius.toFixed(2)}`;
          }
        }
      }
    });
    // --- Debug frame loop (runs for both players) ---
    useFrame(() => {
      if (!showDebug || !rb.current || !opponentRef.current) return;

      const mine = rb.current.translation?.();
      const theirs = opponentRef.current.translation?.();

      if (mine && theirs) {
        // Update debug ring color
        if (debugMaterialRef.current) {
          const inRange = groundDistance(mine, theirs) <= attackRadius * 2;
          debugMaterialRef.current.color.set(inRange ? 0x00ff00 : 0xff0000);
        }

        // Update distance label text
        if (distanceLabelRef.current) {
          const d = groundDistance(mine, theirs);
          distanceLabelRef.current.textContent = `dist: ${d.toFixed(
            2
          )} | R: ${attackRadius.toFixed(2)}`;
        }
      }
    });

    // --- Socket move sync (remote) ---
    useEffect(() => {
      if (!socket || practiceMode) return;

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
    }, [socket, isPlayer1, practiceMode]);

    // --- Imperative API ---
    useImperativeHandle(ref, () => wrapper);

    const isFpp = useRef(false);

    const toggleFppTpp = () => {
      isFpp.current = !isFpp.current;

      if (isFpp.current) {
        cameraPosition.current.position.set(0, 3.2, -0.2);
        cameraTarget.current.position.set(0, 3.1, -1.5);
        if (mainCameraRef.current) {
          mainCameraRef.current.fov = 125;
          mainCameraRef.current.updateProjectionMatrix();
        }
      } else {
        cameraPosition.current.position.set(0, 4.5, 2.5);
        cameraTarget.current.position.set(0, 0, -5.5);
        if (mainCameraRef.current) {
          mainCameraRef.current.fov = 50;
          mainCameraRef.current.updateProjectionMatrix();
        }
      }
    };

    // Keep the object literal separate so we don’t capture stale refs above
    const wrapper = {
      receiveHit: (attackType, attackTime) => {
        // call the same internal hit routine
        takeHit(attackType, attackTime);
      },
      toggleFppTpp,
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
          <group ref={cameraTarget} position-z={-5.5} />
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
