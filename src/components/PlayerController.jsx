import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
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
    const animationRef = useRef("idle");
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
    const opponentRef = useRef();
    const [isInContact, setIsInContact] = useState(false);
    const contactTimeout = useRef(null);
    const lastJoystickMagnitude = useRef(0);
    const joystickChangeThreshold = 0.05;
    const lastFrameRef = useRef(0);
    const soundBuffersRef = useRef(null);

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

    const setAnimation = useCallback((newAnimation) => {
      if (animationRef.current !== newAnimation) {
        animationRef.current = newAnimation;
      }
    }, []);

    useEffect(() => {
      opponentIdRef.current = opponentRef.current?.id;
    }, [opponentRef.current?.id]);

    useEffect(() => {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      const loadSound = async (url) => {
        try {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          return await audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
          console.error("Error loading sound:", error);
          return null;
        }
      };

      Promise.all([
        loadSound(SOUNDS.punch),
        loadSound(SOUNDS.kick),
        loadSound(SOUNDS.hit),
        loadSound(SOUNDS.victory),
        loadSound(SOUNDS.lost),
      ]).then(([punch, kick, hit, victory, lost]) => {
        soundBuffersRef.current = { punch, kick, hit, victory, lost };
      });

      return () => {
        if (audioContext.state !== "closed") {
          audioContext.close();
        }
      };
    }, []);

    const playSound = useCallback((type) => {
      if (!soundBuffersRef.current || !soundBuffersRef.current[type]) return;

      try {
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const source = audioContext.createBufferSource();
        source.buffer = soundBuffersRef.current[type];
        source.connect(audioContext.destination);
        source.start(0);
        return source;
      } catch (error) {
        console.error("Error playing sound:", error);
        return null;
      }
    }, []);

    useEffect(() => {
      const handleResize = () => {
        setIsSmallScreen(window.innerWidth < 640);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    const setOpponentRef = useCallback((ref) => {
      opponentRef.current = ref;
    }, []);

    const startAttack = useCallback(
      (type) => {
        if (isAttacking || isDefeated) return;

        const damage = type === "kick" ? 20 : 10;
        const currentTime = Date.now();
        setLastAttackTime(currentTime);

        if (attackTimer.current) {
          clearTimeout(attackTimer.current);
        }

        playSound(type);

        setIsAttacking(true);
        movementEnabled.current = false;
        setAnimation(type);

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
          setAnimation(isDefeated ? "fall" : "idle");
        }, duration);
      },
      [isAttacking, isDefeated, isInContact, socket, playSound, setAnimation]
    );

    const takeHit = useCallback(
      (attackType, attackTime) => {
        if (isHit || isDefeated) return;
        if (attackTime <= lastAttackTime) return;

        opponentAttackTime.current = attackTime;

        if (hitTimer.current) {
          clearTimeout(hitTimer.current);
        }

        playSound("hit");

        setIsHit(true);
        setAnimation("hit");

        if (character.current?.playHitSound) {
          character.current.playHitSound();
        }

        const duration = 1000;
        hitTimer.current = setTimeout(() => {
          setIsHit(false);
          if (!isAttacking) {
            setAnimation(isDefeated ? "fall" : "idle");
          }
        }, duration);
      },
      [isHit, isDefeated, lastAttackTime, isAttacking, playSound, setAnimation]
    );

    const handleCollisionEnter = useCallback((event) => {
      if (!opponentRef.current || !rb.current) return;

      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        setIsInContact(true);
        if (contactTimeout.current) {
          clearTimeout(contactTimeout.current);
        }
      }
    }, []);

    const handleCollisionExit = useCallback((event) => {
      if (!opponentRef.current || !rb.current) return;

      const otherUserData = event.other.rigidBody?.userData;
      if (otherUserData?.isPlayer) {
        contactTimeout.current = setTimeout(() => {
          setIsInContact(false);
        }, 500);
      }
    }, []);

    useEffect(() => {
      if (isPunching && !isHit) startAttack("punch");
      if (isKicking && !isHit) startAttack("kick");
    }, [isPunching, isKicking, isHit, startAttack]);

    useEffect(() => {
      if (health <= 0 && !isDefeated && socket && opponentRef.current) {
        setIsDefeated(true);
        setAnimation("fall");
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
    }, [health, isDefeated, opponentHealth, socket, setAnimation]);

    useEffect(() => {
      if (!socket) return;

      const onPlayerHit = (data) => {
        if (data.attackerId !== socket.id) {
          takeHit(data.attackType, data.attackTime);
        }
      };

      socket.on("playerHit", onPlayerHit);

      return () => {
        socket.off("playerHit", onPlayerHit);
      };
    }, [socket, takeHit]);

    useFrame(({ camera }) => {
      const now = performance.now();
      if (now - lastFrameRef.current < 16) return;
      lastFrameRef.current = now;

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
          if (!isAttacking) setAnimation(run ? "run" : "walk");
        } else if (backward) {
          movement.z = 0;
          if (!isAttacking) setAnimation("idle");
        } else {
          if (!isAttacking && !isHit) setAnimation("idle");
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
                setAnimation(joystickInput.isRunning ? "run" : "walk");
            } else if (joystickInput.y > 0) {
              movement.z = 0;
              if (!isAttacking) setAnimation("idle");
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
          animation: animationRef.current,
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
          setAnimation(data.animation || "idle");
          setIsAttacking(data.isAttacking || false);
          setIsHit(data.isHit || false);
        }
      };

      socket.on("carMove", onCarMove);
      return () => socket.off("carMove", onCarMove);
    }, [socket, isPlayer1, setAnimation]);

    useImperativeHandle(ref, () => ({
      setOpponentRef,
      setVictory: (isLocalPlayerWinner) => {
        setMatchResult("won");
        setAnimation("victory");
        movementEnabled.current = false;

        setTimeout(() => {
          if (isLocalPlayerWinner) {
            playSound("victory");
          }
        }, 100);
      },
      setDefeat: (isLocalPlayerLoser) => {
        setMatchResult("lost");
        setAnimation("fall");
        movementEnabled.current = false;

        setTimeout(() => {
          if (isLocalPlayerLoser) {
            playSound("lost");
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
        userData={{
          id: socket?.id,
          isPlayer: true,
        }}
        solverIterations={6}
        ccd={true}
        linearDamping={0.7}
        angularDamping={1.2}
        sleepAfterStillness={0.3}
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
                    : animationRef.current
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
                    : animationRef.current
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
