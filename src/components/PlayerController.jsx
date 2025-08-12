import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { Vector3, Quaternion, Euler, MathUtils as ThreeMath } from "three";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
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

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerpAngle = (a, b, t) => {
  // Shortest-path yaw interpolation
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
};

const PlayerController = forwardRef(
  (
    {
      playerId,
      joystickInput,
      position,
      isPlayer1, // layout slot (left/right)
      color,
      isPunching,
      isKicking,
      characterType,
      health,
      opponentHealth,
      playerName,
      opponentName,
      isLocalPlayer, // <— IMPORTANT: true for local client’s avatar
    },
    ref
  ) => {
    const socket = useSocket();

    // --- Visual / animation state ---
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
    const [currentAnimation, setCurrentAnimation] = useState("idle");
    const [isAttacking, setIsAttacking] = useState(false);
    const [isHit, setIsHit] = useState(false);
    const [isDefeated, setIsDefeated] = useState(false);
    const [matchResult, setMatchResult] = useState(null);

    // --- Movement / networking ---
    const WALK_SPEED = 1.5;
    const RUN_SPEED = 2.5;
    const ROT_SPEED = isSmallScreen ? 0.06 : 0.04;

    // Local prediction helpers
    const seqCounter = useRef(0); // input sequence
    const lastSentAt = useRef(0); // throttle send
    const SEND_EVERY_MS = 33; // ~30 Hz to server

    // Interpolation buffers for REMOTE avatar
    const targetPos = useRef(new Vector3(...position));
    const targetYaw = useRef(0);

    // Timers/refs
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);
    const hasEmittedDefeat = useRef(false);
    const opponentRef = useRef();
    const opponentAttackTime = useRef(0);
    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);

    // Audio
    const punchSound = useRef(null);
    const kickSound = useRef(null);
    const hitSound = useRef(null);
    const victorySound = useRef(null);
    const lostSound = useRef(null);

    // R3F/physics
    const rb = useRef();
    const container = useRef();
    const character = useRef();
    const rotationTarget = useRef(0);
    const cameraTarget = useRef();
    const cameraPosition = useRef();
    const cameraLookAt = useRef(new Vector3());
    const cameraTmp1 = useRef(new Vector3());
    const cameraTmp2 = useRef(new Vector3());
    const [, get] = useKeyboardControls();
    const movementEnabled = useRef(true);

    // Sounds init/teardown
    useEffect(() => {
      punchSound.current = new Audio(SOUNDS.punch);
      kickSound.current = new Audio(SOUNDS.kick);
      hitSound.current = new Audio(SOUNDS.hit);
      victorySound.current = new Audio(SOUNDS.victory);
      lostSound.current = new Audio(SOUNDS.lost);
      [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
        (r) => {
          if (r.current) r.current.volume = 0.7;
        }
      );
      return () => {
        [punchSound, kickSound, hitSound, victorySound, lostSound].forEach(
          (r) => {
            if (r.current) {
              r.current.pause();
              r.current.src = "";
              r.current.remove();
              r.current = null;
            }
          }
        );
      };
    }, []);

    // Responsive
    useEffect(() => {
      const onResize = () => setIsSmallScreen(window.innerWidth < 640);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    // Opponent link
    const setOpponentRef = (refObj) => {
      opponentRef.current = refObj;
    };

    // --- Attacks / hits ---
    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;
      const damage = type === "kick" ? 20 : 10;
      const now = Date.now();

      if (type === "punch" && punchSound.current) {
        punchSound.current.currentTime = 0;
        punchSound.current.play().catch(() => {});
      }
      if (type === "kick" && kickSound.current) {
        kickSound.current.currentTime = 0;
        kickSound.current.play().catch(() => {});
      }

      setIsAttacking(true);
      movementEnabled.current = false;
      setCurrentAnimation(type);

      if (
        isLocalPlayer &&
        isInContact &&
        socket &&
        opponentRef.current &&
        !opponentRef.current.isDefeated
      ) {
        socket.emit("playerHit", {
          attackerId: socket.id,
          damage,
          attackType: type,
          attackTime: now, // informational; not used to reject
        });
      }

      clearTimeout(attackTimer.current);
      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = !isDefeated;
        setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, 1000);
    };

    const takeHit = (attackType, attackTime) => {
      if (isHit || isDefeated) return;
      opponentAttackTime.current = attackTime ?? Date.now();

      if (hitSound.current) {
        hitSound.current.currentTime = 0;
        hitSound.current.play().catch(() => {});
      }

      setIsHit(true);
      setCurrentAnimation("hit");

      clearTimeout(hitTimer.current);
      hitTimer.current = setTimeout(() => {
        setIsHit(false);
        if (!isAttacking) setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, 1000);
    };

    // Collisions => allow attacks when touching
    const handleCollisionEnter = (e) => {
      const other = e.other.rigidBody?.userData;
      if (other?.isPlayer) {
        setIsInContact(true);
        if (contactTimeout.current) clearTimeout(contactTimeout.current);
      }
    };
    const handleCollisionExit = (e) => {
      const other = e.other.rigidBody?.userData;
      if (other?.isPlayer) {
        contactTimeout.current = setTimeout(() => setIsInContact(false), 500);
      }
    };

    // Input buttons -> start attack
    useEffect(() => {
      if (isLocalPlayer) {
        if (isPunching && !isHit) startAttack("punch");
        if (isKicking && !isHit) startAttack("kick");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPunching, isKicking]);

    // Defeat emit
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

    // Listen: hits addressed to me
    useEffect(() => {
      if (!socket) return;
      const onPlayerHit = (data) => {
        if (data.victimId === playerId)
          takeHit(data.attackType, data.attackTime);
      };
      socket.on("playerHit", onPlayerHit);
      return () => socket.off("playerHit", onPlayerHit);
    }, [socket, playerId]);

    // Listen: authoritative snapshots from server
    useEffect(() => {
      if (!socket) return;
      const onState = (snap) => {
        // Find my record for THIS controller instance
        const me = snap.players.find((p) => p.id === playerId);
        if (!me) return;

        // For REMOTE avatars: update interpolation targets
        if (!isLocalPlayer && me.pose) {
          targetPos.current.set(
            clamp(me.pose.position.x, -50, 50),
            clamp(me.pose.position.y, -1, 10),
            clamp(me.pose.position.z, -50, 50)
          );
          targetYaw.current = me.pose.rotationY || 0;
          setCurrentAnimation(me.pose.animation || "idle");
          setIsAttacking(!!me.pose.isAttacking);
          setIsHit(!!me.pose.isHit);
        }
      };
      socket.on("stateUpdate", onState);
      return () => socket.off("stateUpdate", onState);
    }, [socket, playerId, isLocalPlayer]);

    // Optional: input ack (clear pending if you keep a list)
    useEffect(() => {
      if (!socket) return;
      const onAck = () => {};
      socket.on("inputAck", onAck);
      return () => socket.off("inputAck", onAck);
    }, [socket]);

    // Per-frame update
    useFrame(({ camera }) => {
      if (!rb.current) return;

      // ----- LOCAL PLAYER: predict immediately -----
      if (isLocalPlayer && !isDefeated) {
        const vel = rb.current.linvel();
        const { forward, backward, left, right, run, punch, kick } = get();

        if (punch && !isAttacking && !isHit) startAttack("punch");
        if (kick && !isAttacking && !isHit) startAttack("kick");

        let moving = false;

        if (movementEnabled.current && !isHit) {
          // Mouse/joystick rotation + forward motion
          if (
            joystickInput &&
            (Math.abs(joystickInput.x) > 0.1 || Math.abs(joystickInput.y) > 0.1)
          ) {
            if (Math.abs(joystickInput.x) > 0.1) {
              rotationTarget.current += ROT_SPEED * joystickInput.x;
            }
            if (joystickInput.y < 0) {
              const speed = joystickInput.isRunning ? RUN_SPEED : WALK_SPEED;
              const dir = new Vector3(
                Math.sin(rotationTarget.current),
                0,
                Math.cos(rotationTarget.current)
              ).normalize();
              vel.x = dir.x * -speed;
              vel.z = dir.z * -speed;
              moving = true;
              if (!isAttacking)
                setCurrentAnimation(joystickInput.isRunning ? "run" : "walk");
            }
          }

          // Keyboard forward/back
          if (forward) {
            const speed = run ? RUN_SPEED : WALK_SPEED;
            vel.x = Math.sin(rotationTarget.current) * -speed;
            vel.z = Math.cos(rotationTarget.current) * -speed;
            moving = true;
            if (!isAttacking) setCurrentAnimation(run ? "run" : "walk");
          } else if (backward) {
            // no backward walk in this design; idle if not moving
          }

          if (left) rotationTarget.current += ROT_SPEED;
          if (right) rotationTarget.current -= ROT_SPEED;
        }

        if (!moving && !isAttacking && !isHit) setCurrentAnimation("idle");

        // Apply prediction velocity and smoothed yaw
        rb.current.setLinvel(vel, true);
        container.current.rotation.y = ThreeMath.lerp(
          container.current.rotation.y,
          rotationTarget.current,
          0.1
        );

        // Camera follow
        cameraPosition.current.getWorldPosition(cameraTmp1.current);
        camera.position.lerp(cameraTmp1.current, 0.1);
        if (cameraTarget.current) {
          cameraTarget.current.getWorldPosition(cameraTmp2.current);
          cameraLookAt.current.lerp(cameraTmp2.current, 0.1);
          camera.lookAt(cameraLookAt.current);
        }

        // Throttled send of pose to server
        const now = performance.now();
        if (socket && now - lastSentAt.current > SEND_EVERY_MS) {
          lastSentAt.current = now;
          seqCounter.current += 1;

          socket.emit("carMove", {
            seq: seqCounter.current,
            position: rb.current.translation(),
            rotation: container.current.rotation.y,
            animation: currentAnimation,
            isAttacking,
            isHit,
            health,
          });
        }
      }

      // ----- REMOTE PLAYER: smooth to server targets -----
      if (!isLocalPlayer) {
        // Smooth position
        const curr = rb.current.translation();
        const lerped = new Vector3(
          ThreeMath.lerp(curr.x, targetPos.current.x, 0.12),
          ThreeMath.lerp(curr.y, targetPos.current.y, 0.12),
          ThreeMath.lerp(curr.z, targetPos.current.z, 0.12)
        );
        rb.current.setTranslation(lerped, false);

        // Smooth yaw
        const yaw = container.current.rotation.y;
        const newYaw = lerpAngle(yaw, targetYaw.current, 0.14);
        container.current.rotation.y = newYaw;
      }
    });

    // Expose a tiny API upward
    useImperativeHandle(ref, () => ({
      setOpponentRef,
      setVictory: (isLocalWinner) => {
        setMatchResult("won");
        setCurrentAnimation("victory");
        movementEnabled.current = false;
        setTimeout(() => {
          if (isLocalWinner && victorySound.current) {
            victorySound.current.currentTime = 0;
            victorySound.current.play().catch(() => {});
          }
        }, 100);
      },
      setDefeat: (isLocalLoser) => {
        setMatchResult("lost");
        setCurrentAnimation("fall");
        movementEnabled.current = false;
        setTimeout(() => {
          if (isLocalLoser && lostSound.current) {
            lostSound.current.currentTime = 0;
            lostSound.current.play().catch(() => {});
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
        userData={{ id: playerId, isPlayer: true }}
        solverIterations={10}
        ccd
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
