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
import { Howl, Howler } from "howler";

// Audio paths - adjust these to match your actual file paths
const SOUNDS = {
  punch: "/punch.mp3",
  kick: "/kick.mp3",
  hit: "/hit.mp3",
  victory: "/victory.mp3",
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
    const [soundsReady, setSoundsReady] = useState(false);
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);

    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);
    const lastJoystickMagnitude = useRef(0);
    const joystickChangeThreshold = 0.05;

    // Audio refs using Howler
    const sounds = useRef({
      punch: null,
      kick: null,
      hit: null,
      victory: null,
    });

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

    // Initialize audio with Howler
    useEffect(() => {
      // Configure Howler global settings
      Howler.volume(0.7);

      // Load sounds with error handling
      sounds.current.punch = new Howl({
        src: [SOUNDS.punch],
        volume: 0.7,
        onload: () => checkAllSoundsLoaded(),
      });

      sounds.current.kick = new Howl({
        src: [SOUNDS.kick],
        volume: 0.7,
        onload: () => checkAllSoundsLoaded(),
      });

      sounds.current.hit = new Howl({
        src: [SOUNDS.hit],
        volume: 0.4,
        onload: () => checkAllSoundsLoaded(),
        onplayerror: function () {
          console.log("Hit sound play failed, trying again...");
          this.play();
        },
      });

      sounds.current.victory = new Howl({
        src: [SOUNDS.victory],
        volume: 0.8,
        onload: () => checkAllSoundsLoaded(),
      });

      // Handle mobile audio context unlocking
      const unlockAudio = () => {
        if (Howler.ctx.state === "suspended") {
          Howler.ctx.resume().then(() => {
            console.log("Audio context unlocked");
          });
        }

        // Play and immediately stop sounds to unlock audio
        Object.values(sounds.current).forEach((sound) => {
          if (sound) {
            sound.play();
            sound.stop();
          }
        });

        document.removeEventListener("click", unlockAudio);
        document.removeEventListener("touchstart", unlockAudio);
      };

      document.addEventListener("click", unlockAudio);
      document.addEventListener("touchstart", unlockAudio);

      return () => {
        // Cleanup
        Object.values(sounds.current).forEach((sound) => {
          if (sound) sound.unload();
        });
        Howler.unload();
        document.removeEventListener("click", unlockAudio);
        document.removeEventListener("touchstart", unlockAudio);
      };
    }, []);

    const checkAllSoundsLoaded = () => {
      if (
        Object.values(sounds.current).every(
          (sound) => sound && sound.state() === "loaded"
        )
      ) {
        setSoundsReady(true);
      }
    };

    const setOpponentRef = (ref) => {
      opponentRef.current = ref;
    };

    const startAttack = (type) => {
      if (isAttacking || isDefeated) return;

      const damage = type === "kick" ? 20 : 10;

      if (attackTimer.current) {
        clearTimeout(attackTimer.current);
      }

      // Play sound with error handling
      const playSound = () => {
        try {
          if (type === "punch" && sounds.current.punch) {
            sounds.current.punch.play();
          } else if (type === "kick" && sounds.current.kick) {
            sounds.current.kick.play();
          }
        } catch (error) {
          console.error(`Error playing ${type} sound:`, error);
        }
      };

      if (Howler.ctx.state === "suspended") {
        Howler.ctx.resume().then(playSound);
      } else {
        playSound();
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
        });
      }

      const duration = 1000;
      attackTimer.current = setTimeout(() => {
        setIsAttacking(false);
        movementEnabled.current = !isDefeated;
        setCurrentAnimation(isDefeated ? "fall" : "idle");
      }, duration);
    };

    const takeHit = (attackType) => {
      if (isHit || isDefeated) return;

      if (hitTimer.current) {
        clearTimeout(hitTimer.current);
      }

      // Play hit sound with robust error handling
      const playHitSound = () => {
        if (!sounds.current.hit) return;

        try {
          sounds.current.hit.play();
        } catch (error) {
          console.error("Error playing hit sound:", error);
          // Try again after a short delay
          setTimeout(() => {
            sounds.current.hit.play();
          }, 100);
        }
      };

      // Ensure audio context is ready
      if (Howler.ctx.state === "suspended") {
        Howler.ctx
          .resume()
          .then(playHitSound)
          .catch((error) => {
            console.error("Failed to resume audio context:", error);
          });
      } else {
        playHitSound();
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

    useImperativeHandle(ref, () => ({
      setOpponentRef,

      setVictory: () => {
        setMatchResult("won");
        setCurrentAnimation("victory");
        movementEnabled.current = false;

        if (sounds.current.victory) {
          sounds.current.victory.play();
        }
      },
      setDefeat: () => {
        setMatchResult("lost");
        setCurrentAnimation("fall");
        movementEnabled.current = false;
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

        Object.values(sounds.current).forEach((sound) => {
          if (sound) sound.unload();
        });
        Howler.unload();
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
          <group ref={character} rotation-y={Math.PI}>
            {characterType === "cena" ? (
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
            ) : (
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
