import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  CapsuleCollider,
  interactionGroups,
  RigidBody,
} from "@react-three/rapier";
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
    const [lastAttackTime, setLastAttackTime] = useState(0);
    const attackTimer = useRef(null);
    const hitTimer = useRef(null);
    const opponentAttackTime = useRef(0);
    const hasEmittedDefeat = useRef(false);
    const opponentIdRef = useRef(null);
    const GROUP_BODY = 0x0002; // body ↔ body
    const GROUP_SENSOR = 0x0004; // sensor ↔ sensor

    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const intersectingWithOpponent = useRef(false);
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
      if (isHit || isDefeated) return;
      if (attackTime <= opponentAttackTime.current) return;

      if (hitSound.current) {
        hitSound.current.currentTime = 0;
        hitSound.current.play().catch(() => {
          console.log("iOS blocked audio, still animating hit");
        });
      }

      opponentAttackTime.current = attackTime;

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

    const handleSensorEnter = (e) => {
      const otherRB = e.other?.rigidBody;
      const otherCol = e.other?.collider;
      const otherData = otherRB?.userData;
      // ✅ Only count if our sensor touches their sensor, and it’s the opponent
      if (
        otherCol?.isSensor &&
        otherData?.isPlayer &&
        otherData.id !== socket?.id
      ) {
        setIsInContact(true);
      }
    };

    const handleSensorExit = (e) => {
      const otherRB = e.other?.rigidBody;
      const otherCol = e.other?.collider;
      const otherData = otherRB?.userData;
      if (
        otherCol?.isSensor &&
        otherData?.isPlayer &&
        otherData.id !== socket?.id
      ) {
        setIsInContact(false); // no linger: moving apart cancels immediately
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
        mass={1}
        enabledRotations={[false, true, false]}
        ref={rb}
        type="dynamic"
        gravityScale={9}
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
              args={[0.48, 0.3]}
              position={[0, 1.0, 0]}
              restitution={0.1}
              friction={0.5}
              collisionGroups={interactionGroups(GROUP_BODY, GROUP_BODY)}
            />
            <CapsuleCollider
              args={[0.6, 0.5]} // use YOUR current sensor size
              position={[0, 1.0, 0.25]} // and YOUR current sensor offset
              collisionGroups={interactionGroups(GROUP_SENSOR, GROUP_SENSOR)}
              sensor
              onIntersectionEnter={handleSensorEnter}
              onIntersectionExit={handleSensorExit}
            />
          </group>
        </group>
      </RigidBody>
    );
  }
);

export default PlayerController;
