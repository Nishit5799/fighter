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
import { sounds } from "@/utils/sounds";

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
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);
    const attackDamage = 10;
    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);
    const lastJoystickMagnitude = useRef(0);
    const joystickChangeThreshold = 0.05;

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

      // Play attack sound
      if (isLocalPlayer) {
        // Only play sound for local player
        const sound = type === "punch" ? sounds.punch : sounds.kick;
        sound.currentTime = 0; // Rewind to start
        sound.play().catch((e) => console.log("Sound play failed:", e));
      }

      // Standardize damage to 10
      const damage = 10;

      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
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
          damage: damage, // Always send 10 damage
          attackType: type,
        });
      }

      const duration = 700;
      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = !isDefeated;
        setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, duration);
    };

    const takeHit = (attackType) => {
      if (isHit || isDefeated) return;
      sounds.hit.currentTime = 0;
      sounds.hit.play().catch((e) => console.log("Hit sound play failed:", e));

      if (hitTimer.current) {
        clearTimeout(hitTimer.current);
      }

      setIsHit(true);
      setCurrentAnimation("hit");

      if (character.current?.playHitSound) {
        character.current.playHitSound();
      }

      const duration = 700;
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
      if (otherUserData?.id === opponentRef.current?.id) {
        setIsInContact(true);
        if (contactTimeout.current) {
          clearTimeout(contactTimeout.current);
        }
      }
    };

    const handleCollisionExit = (event) => {
      if (!opponentRef.current || !rb.current) return;
      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.id === opponentRef.current?.id) {
        contactTimeout.current = setTimeout(() => {
          setIsInContact(false);
        }, 100);
      }
    };

    useEffect(() => {
      if (isPunching && !isHit) startAttack("punch");
      if (isKicking && !isHit) startAttack("kick");
    }, [isPunching, isKicking]);

    useEffect(() => {
      if (health <= 0 && !isDefeated && socket) {
        setIsDefeated(true);
        setCurrentAnimation("fall");
        movementEnabled.current = false;
        socket.emit("playerDefeated", {
          winnerId: opponentRef.current?.id,
          loserId: socket.id,
          winnerHealth: opponentHealth,
          loserHealth: health,
        });
      }
    }, [health, isDefeated, opponentHealth, socket]);

    useEffect(() => {
      if (!socket) return;

      const onPlayerHit = (data) => {
        if (data.attackerId !== socket.id) {
          takeHit(data.attackType);
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

    const respawn = () => {
      if (attackTimer.current) clearTimeout(attackTimer.current);
      if (hitTimer.current) clearTimeout(hitTimer.current);
      if (contactTimeout.current) clearTimeout(contactTimeout.current);
      rb.current.setTranslation({ x: 0, y: -10, z: -10 });
      rb.current.setLinvel({ x: 0, y: 0, z: 0 });
      rb.current.setAngvel({ x: 0, y: 0, z: 0 });
      rotationTarget.current = 0;
      container.current.rotation.y = 0;
      setCurrentAnimation("idle");
      setIsAttacking(false);
      setIsHit(false);
      setIsDefeated(false);
      setMatchResult(null);
      movementEnabled.current = true;
      setIsInContact(false);
    };

    // In the useImperativeHandle section of PlayerController.jsx
    useImperativeHandle(ref, () => ({
      respawn,
      setOpponentRef,

      setVictory: () => {
        setMatchResult("won");
        setCurrentAnimation("victory");
        movementEnabled.current = false;
        // Play victory sound for local player
        if (isLocalPlayer) {
          sounds.victory.currentTime = 0;
          sounds.victory
            .play()
            .catch((e) => console.log("Victory sound play failed:", e));
        }
      },
      setDefeat: () => {
        setMatchResult("lost");
        setCurrentAnimation("fall");
        movementEnabled.current = false;
        // Play fall sound for local player
        if (isLocalPlayer) {
          sounds.fall.currentTime = 0;
          sounds.fall
            .play()
            .catch((e) => console.log("Fall sound play failed:", e));
        }
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

    useEffect(() => {
      console.log(
        `[${playerName}] Health: ${health}% | State: ${
          matchResult === "won"
            ? "VICTORY"
            : matchResult === "lost"
            ? "DEFEAT"
            : "PLAYING"
        }`
      );
    }, [health, matchResult, playerName]);

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
          <group ref={character} rotation-y={Math.PI}>
            {characterType === "austin" ? (
              <Stone
                scale={isSmallScreen ? 2.7 : 3.18}
                position-y={-0.25}
                color={color}
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
              <Cenaa
                scale={isSmallScreen ? 2.7 : 3.18}
                position-y={-0.25}
                color={color}
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
