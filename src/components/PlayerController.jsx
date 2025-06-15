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
import Cena from "./Cena";
import Austinn from "./Austinn";

const PlayerController = forwardRef(
  (
    {
      joystickInput,
      onRaceEnd,
      position,
      isPlayer1,
      color,
      isPunching,
      isKicking,
      characterType,
    },
    ref
  ) => {
    const socket = useSocket();
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
    const [isBraking, setIsBraking] = useState(false);
    const [isReversing, setIsReversing] = useState(false);
    const [currentAnimation, setCurrentAnimation] = useState("idle");
    const [isAttacking, setIsAttacking] = useState(false);
    const [isHit, setIsHit] = useState(false);
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);
    const colliderArgs = isSmallScreen ? [0.2, 0.4] : [0.2, 0.4];
    const attackDamage = 10;
    const [health, setHealth] = useState(100);
    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const [showDebugCollider] = useState(true);
    const contactTimeout = useRef(null);
    const lastJoystickMagnitude = useRef(0);
    const joystickChangeThreshold = 0.05; // Only log if magnitude changes by this amount

    useEffect(() => {
      const handleResize = () => {
        setIsSmallScreen(window.innerWidth < 640);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    const WALK_SPEED = isSmallScreen ? 2.8 : 2;
    const RUN_SPEED = 4;
    const ROTATION_SPEED = isSmallScreen ? 0.08 : 0.04;

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

    const setOpponentRef = (ref) => {
      opponentRef.current = ref;
      console.log("Opponent reference set:", ref?.id);
    };

    const startAttack = (type) => {
      if (isAttacking) return;

      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
      }

      setIsAttacking(true);
      movementEnabled.current = false;
      setCurrentAnimation(type);

      console.log(
        `Starting ${type} attack. In contact: ${isInContact}, Opponent: ${
          opponentRef.current ? "exists" : "null"
        }`
      );

      if (isInContact && socket && opponentRef.current) {
        console.log(`${type} landed on opponent!`);
        socket.emit("playerHit", {
          attackerId: socket.id,
          damage: attackDamage,
          attackType: type,
        });
      } else {
        console.log(
          `${type} missed - contact:${isInContact}, opponent:${!!opponentRef.current}`
        );
      }

      const duration = type === "punch" ? 800 : 1000;
      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = true;
        setCurrentAnimation("idle");
      }, duration);
    };

    const takeHit = (attackType) => {
      if (isHit) return;

      if (hitTimer.current) {
        clearTimeout(hitTimer.current);
      }

      setIsHit(true);
      setCurrentAnimation("hit");
      setHealth((prev) => Math.max(0, prev - attackDamage));

      console.log(
        `Player took ${attackType} hit! Current health: ${
          health - attackDamage
        }`
      );

      if (character.current?.playHitSound) {
        character.current.playHitSound();
      }

      if (health - attackDamage <= 0) {
        console.log("Player defeated!");
        if (socket) {
          socket.emit("playerDefeated", {
            winnerId: socket.id,
            loserId: opponentRef.current?.id,
          });
        }
      }

      const duration = 1000;
      hitTimer.current = setTimeout(() => {
        setIsHit(false);
        if (!isAttacking) {
          setCurrentAnimation("idle");
        }
      }, duration);
    };

    const handleCollisionEnter = (event) => {
      if (!opponentRef.current || !rb.current) {
        console.log("No opponent or rigid body reference");
        return;
      }

      const otherUserData = event.other.rigidBody?.userData;
      // console.log("Collision enter with:", otherUserData?.id);

      if (otherUserData?.id === opponentRef.current?.id) {
        // console.log("Valid collision with opponent detected");
        setIsInContact(true);

        if (contactTimeout.current) {
          clearTimeout(contactTimeout.current);
        }
      }
    };

    const handleCollisionExit = (event) => {
      if (!opponentRef.current || !rb.current) return;

      const otherUserData = event.other.rigidBody?.userData;
      // console.log("Collision exit with:", otherUserData?.id);

      if (otherUserData?.id === opponentRef.current?.id) {
        contactTimeout.current = setTimeout(() => {
          // console.log("No longer colliding with opponent");
          setIsInContact(false);
        }, 100);
      }
    };

    useEffect(() => {
      if (isPunching && !isHit) startAttack("punch");
      if (isKicking && !isHit) startAttack("kick");
    }, [isPunching, isKicking]);

    useEffect(() => {
      if (!socket) return;

      const onPlayerHit = (data) => {
        if (data.attackerId !== socket.id) {
          takeHit(data.attackType);
        }
      };

      const onPlayerDefeated = (data) => {
        if (data.loserId === socket.id) {
          setCurrentAnimation("defeated");
          setPopupMessage("You were defeated! Better luck next time!");
          setShowPopup(true);
        } else if (data.winnerId === socket.id) {
          setCurrentAnimation("victory");
          setPopupMessage("You won the match! Congratulations!");
          setShowPopup(true);
        }
      };

      socket.on("playerHit", onPlayerHit);
      socket.on("playerDefeated", onPlayerDefeated);

      return () => {
        socket.off("playerHit", onPlayerHit);
        socket.off("playerDefeated", onPlayerDefeated);
      };
    }, [socket]);
    useFrame(({ camera }) => {
      if (!rb.current || !isPlayer1) return;

      const vel = rb.current.linvel();
      const movement = { x: 0, z: 0 };
      const isUsingJoystick =
        joystickInput &&
        (Math.abs(joystickInput.x) > 0.1 || Math.abs(joystickInput.y) > 0.1);
      const { forward, backward, left, right, run, punch, kick } = get();

      // Handle attacks
      if (punch && !isAttacking && !isHit) startAttack("punch");
      if (kick && !isAttacking && !isHit) startAttack("kick");

      if (movementEnabled.current && !isHit) {
        // Keyboard movement handling
        if (forward) {
          movement.z = -WALK_SPEED;
          setIsBraking(false);
          setIsReversing(false);
          if (!isAttacking) setCurrentAnimation("run");
        } else if (backward) {
          movement.z = 0;
          setIsReversing(true);
          if (!isAttacking) setCurrentAnimation("idle");
        } else {
          setIsReversing(false);
          setIsBraking(false);
          if (!isAttacking && !isHit) setCurrentAnimation("idle");
        }

        // Joystick input handling - optimized version
        if (joystickInput) {
          const joystickMagnitude = Math.sqrt(
            joystickInput.x * joystickInput.x +
              joystickInput.y * joystickInput.y
          );

          if (
            Math.abs(joystickMagnitude - lastJoystickMagnitude.current) >
            joystickChangeThreshold
          ) {
            console.log(joystickMagnitude);
            lastJoystickMagnitude.current = joystickMagnitude;
          }

          // Only process if joystick is being actively used (deadzone)
          if (joystickMagnitude > 0.1) {
            // Rotation
            if (Math.abs(joystickInput.x) > 0.1) {
              rotationTarget.current += ROTATION_SPEED * joystickInput.x;
            }

            // Movement - maintain full speed in movement direction
            if (joystickInput.y < 0) {
              movement.z = -WALK_SPEED;
              setIsBraking(false);
              setIsReversing(false);
              if (!isAttacking) setCurrentAnimation("run");
            } else if (joystickInput.y > 0) {
              movement.z = 0;
              setIsReversing(true);
              if (!isAttacking) setCurrentAnimation("idle");
            }
          }
        }

        // Keyboard rotation handling
        if (left) movement.x = 1;
        if (right) movement.x = -1;
      }

      // Apply rotation
      if (movement.x !== 0 && movementEnabled.current && !isHit) {
        rotationTarget.current += ROTATION_SPEED * movement.x;
      }

      // Apply movement - special handling for joystick
      if (movementEnabled.current && !isHit) {
        if (isUsingJoystick && joystickInput.y < 0) {
          // For joystick: maintain constant speed in movement direction
          const moveDirection = new Vector3(
            Math.sin(rotationTarget.current),
            0,
            Math.cos(rotationTarget.current)
          ).normalize();

          vel.x = moveDirection.x * -WALK_SPEED;
          vel.z = moveDirection.z * -WALK_SPEED;
        } else if (movement.x !== 0 || movement.z !== 0) {
          // Default movement for keyboard
          vel.x = Math.sin(rotationTarget.current) * movement.z;
          vel.z = Math.cos(rotationTarget.current) * movement.z;
        }
      }

      // Update rigid body velocity
      rb.current.setLinvel(vel, true);

      // Sync with server
      if (socket) {
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

      // Camera follow for player 1
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
      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
      }
      if (hitTimer.current) {
        clearTimeout(hitTimer.current);
      }
      if (contactTimeout.current) {
        clearTimeout(contactTimeout.current);
      }
      rb.current.setTranslation({ x: 0, y: -10, z: -10 });
      rb.current.setLinvel({ x: 0, y: 0, z: 0 });
      rb.current.setAngvel({ x: 0, y: 0, z: 0 });
      rotationTarget.current = 0;
      container.current.rotation.y = 0;
      setCurrentAnimation("idle");
      setIsAttacking(false);
      setIsHit(false);
      setHealth(100);
      movementEnabled.current = true;
      setIsInContact(false);
    };

    useImperativeHandle(ref, () => ({
      respawn,
      setOpponentRef,
      translation: () => rb.current?.translation(),
      id: socket?.id,
      rigidBody: rb.current,
    }));

    useEffect(() => {
      return () => {
        if (attackTimer.current) {
          clearTimeout(attackTimer.current);
        }
        if (hitTimer.current) {
          clearTimeout(hitTimer.current);
        }
        if (contactTimeout.current) {
          clearTimeout(contactTimeout.current);
        }
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
        userData={{ id: socket?.id }}
      >
        <group ref={container} position={position}>
          <group ref={cameraTarget} position-z={-5.5} rotation-y={Math.PI} />
          <group ref={cameraPosition} position-y={4.5} position-z={2.5} />
          <group ref={character} rotation-y={Math.PI}>
            {characterType === "austin" ? (
              <Austinn
                scale={isSmallScreen ? 2.7 : 3.18}
                position-y={-0.25}
                isBraking={isBraking}
                isReversing={isReversing}
                color={color}
                animation={isHit ? "hit" : currentAnimation}
              />
            ) : (
              <Cena
                scale={isSmallScreen ? 2.7 : 3.18}
                position-y={-0.25}
                isBraking={isBraking}
                isReversing={isReversing}
                color={color}
                animation={isHit ? "hit" : currentAnimation}
              />
            )}
            <CapsuleCollider args={colliderArgs} position={[0, 3, 0]} />
            <CapsuleCollider
              args={[0.3, 0.6]}
              position={[0, 3, 0]}
              sensor
              onCollisionEnter={handleCollisionEnter}
              onCollisionExit={handleCollisionExit}
            />
          </group>
        </group>
      </RigidBody>
    );
  }
);

export default PlayerController;
