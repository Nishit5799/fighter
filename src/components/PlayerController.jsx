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

// ---- iOS + proximity helpers ----
const IS_IOS =
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);
const HIT_DISTANCE = 1.35; // normal proximity
const START_GRACE_MS = 2000; // widen a bit for first 2s on iOS
const GRACE_MULTIPLIER = 1.25; // ~25% more leniency at start on iOS

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
    const [isSmallScreen, setIsSmallScreen] = useState(
      typeof window !== "undefined" ? window.innerWidth < 640 : false
    );
    const [currentAnimation, setCurrentAnimation] = useState("idle");
    const [isAttacking, setIsAttacking] = useState(false);
    const [isHit, setIsHit] = useState(false);
    const [isDefeated, setIsDefeated] = useState(false);
    const [matchResult, setMatchResult] = useState(null);

    // --- Refs ---
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);
    const opponentAttackTime = useRef(0);

    const hasEmittedDefeat = useRef(false);
    const opponentRef = useRef();

    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);

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

    // Track match start (for iOS grace)
    const mountedAtRef = useRef(Date.now());
    const iosFirstGraceHitUsed = useRef(false);

    // Init / teardown sounds + iOS media hints
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

      // iOS: keep audio inline & preloaded so playback failures don’t block logic
      [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
        (snd) => {
          if (snd.current) {
            // @ts-ignore
            snd.current.playsInline = true;
            snd.current.preload = "auto";
          }
        }
      );

      return () => {
        [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
          (soundRef) => {
            if (soundRef.current) {
              soundRef.current.pause();
              soundRef.current.src = "";
              try {
                soundRef.current.remove?.();
              } catch {}
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

    // --- API exposed to parent ---
    const setOpponentRef = (r) => {
      opponentRef.current = r;
    };

    // --- Attack path ---
    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;

      const damage = type === "kick" ? 20 : 10;
      const now = Date.now();

      if (attackTimer.current) clearTimeout(attackTimer.current);

      // fire local SFX (don’t care if it fails on iOS)
      const snd = type === "punch" ? punchSound.current : kickSound.current;
      if (snd) {
        snd.currentTime = 0;
        snd.play().catch(() => {});
      }

      setIsAttacking(true);
      movementEnabled.current = false;
      setCurrentAnimation(type);

      // 1) contact flag
      let canHit = isInContact;

      // 2) proximity fallback
      let measuredDistance = Infinity;
      if (opponentRef.current && rb.current) {
        try {
          const a = rb.current.translation();
          const b = opponentRef.current.translation?.();
          if (a && b) {
            const dx = a.x - b.x;
            const dz = a.z - b.z;
            measuredDistance = Math.hypot(dx, dz);

            const grace =
              IS_IOS && now - mountedAtRef.current < START_GRACE_MS
                ? HIT_DISTANCE * GRACE_MULTIPLIER
                : HIT_DISTANCE;

            if (measuredDistance <= grace) canHit = true;
          }
        } catch {
          // ignore
        }
      }

      // 3) last‑ditch iOS-only start grace if we can’t even sample opponent yet
      if (!canHit && IS_IOS && !iosFirstGraceHitUsed.current) {
        const withinStart = now - mountedAtRef.current < 600; // ~first tap
        if (withinStart) {
          canHit = true;
          iosFirstGraceHitUsed.current = true;
        }
      }

      if (
        canHit &&
        socket &&
        opponentRef.current &&
        !opponentRef.current.isDefeated
      ) {
        socket.emit("playerHit", {
          attackerId: socket.id,
          damage,
          attackType: type,
          attackTime: now,
        });
      }

      // recover from attack anim
      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = !isDefeated;
        setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, 1000);
    };

    // Hit reaction (victim side)
    const takeHit = (attackType, attackTime) => {
      if (isHit || isDefeated) return;

      opponentAttackTime.current = attackTime ?? Date.now();

      if (hitSound.current) {
        hitSound.current.currentTime = 0;
        hitSound.current.play().catch(() => {});
      }

      if (hitTimer.current) clearTimeout(hitTimer.current);

      setIsHit(true);
      setCurrentAnimation("hit");

      if (character.current?.playHitSound) {
        try {
          character.current.playHitSound();
        } catch {}
      }

      hitTimer.current = setTimeout(() => {
        setIsHit(false);
        if (!isAttacking) setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, 1000);
    };

    // --- Collisions (for contact flag) ---
    const handleCollisionEnter = (event) => {
      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        setIsInContact(true);
        if (contactTimeout.current) clearTimeout(contactTimeout.current);
      }
    };

    const handleCollisionExit = (event) => {
      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        contactTimeout.current = setTimeout(() => {
          setIsInContact(false);
        }, 350);
      }
    };

    // --- Triggers from UI/props ---
    useEffect(() => {
      if (isPunching && !isHit) startAttack("punch");
      if (isKicking && !isHit) startAttack("kick");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPunching, isKicking]);

    // --- Death & match result ---
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

    // --- Socket: receive hits for this player ---
    useEffect(() => {
      if (!socket) return;

      const onPlayerHit = (data) => {
        if (data.victimId === playerId) {
          takeHit(data.attackType, data.attackTime);
        }
      };

      socket.on("playerHit", onPlayerHit);
      return () => socket.off("playerHit", onPlayerHit);
    }, [socket, playerId]);

    // --- Frame loop: movement & sync ---
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
          if (!isAttacking) setCurrentAnimation("idle");
        }

        if (isUsingJoystick) {
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

    // --- Remote move sync ---
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
    const wrapper = {
      setOpponentRef,
      setVictory: (isLocalPlayerWinner) => {
        setMatchResult("won");
        setCurrentAnimation("victory");
        movementEnabled.current = false;
        setTimeout(() => {
          if (isLocalPlayerWinner && victorySound.current) {
            victorySound.current.currentTime = 0;
            victorySound.current.play().catch(() => {});
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
            lostSound.current.play().catch(() => {});
          }
        }, 200);
      },
      translation: () => rb.current?.translation(),
      id: socket?.id,
      rigidBody: rb.current,
      isDefeated,
    };

    // Cleanup
    useEffect(() => {
      return () => {
        if (attackTimer.current) clearTimeout(attackTimer.current);
        if (hitTimer.current) clearTimeout(hitTimer.current);
        if (contactTimeout.current) clearTimeout(contactTimeout.current);
        [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
          (s) => {
            if (s.current) {
              s.current.pause();
              s.current = null;
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
        userData={{ id: playerId, isPlayer: true }}
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
            {/* main dynamic collider */}
            <CapsuleCollider
              args={[0.4, 0.3]}
              position={[0, 3, 0]}
              restitution={0.1}
              friction={0.5}
            />
            {/* sensor for soft contact detection */}
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
