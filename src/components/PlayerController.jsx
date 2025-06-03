// src/components/CarController.jsx
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
import Fighter from "./Fighter";

const PlayerController = forwardRef(
  ({ joystickInput, onRaceEnd, position, isPlayer1, color }, ref) => {
    const socket = useSocket();
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
    const [isBraking, setIsBraking] = useState(false);
    const [isReversing, setIsReversing] = useState(false);


    useEffect(() => {
      const handleResize = () => {
        setIsSmallScreen(window.innerWidth < 640);
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    const WALK_SPEED = isSmallScreen ? 90 : 100;
    const RUN_SPEED = 100;
    const ROTATION_SPEED = isSmallScreen ? 0.03 : 0.02;
    const ACCELERATION = 0.5;
    const DECELERATION = 1;

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

    const currentSpeed = useRef(0);

    useFrame(({ camera, mouse }) => {
      if (rb.current && isPlayer1) {
        const vel = rb.current.linvel();
        const movement = {
          x: 0,
          z: 0,
        };

        let targetSpeed = 0;

        const { forward, backward, left, right, run } = get();
        if (forward) {
          targetSpeed = run ? RUN_SPEED : WALK_SPEED;

          setIsBraking(false);
          setIsReversing(false);
          setIsMovingForward(true);
        } else if (backward) {
          if (currentSpeed.current > 0) {
            targetSpeed = 0;
          } else {
            targetSpeed = 0;
          }
          setIsReversing(true);
          setIsMovingForward(false);
        } else {
          setIsReversing(false);
          setIsBraking(false);
          setIsMovingForward(false);
        }

        if (joystickInput) {
          if (joystickInput.y < 0) {
            targetSpeed = WALK_SPEED;
            setIsBraking(false);
            setIsReversing(false);
            setIsMovingForward(true);
          } else if (joystickInput.y > 0) {
            if (currentSpeed.current > 0) {
              targetSpeed = 0;
            } else {
              targetSpeed = 0;
            }
            setIsReversing(true);
            setIsMovingForward(false);
          }
          rotationTarget.current += ROTATION_SPEED * joystickInput.x;
        }

        if (currentSpeed.current < targetSpeed) {
          currentSpeed.current += ACCELERATION;
        } else if (currentSpeed.current > targetSpeed) {
          currentSpeed.current -= DECELERATION;
        }

        if (currentSpeed.current !== 0) {
          movement.z = currentSpeed.current > 0 ? -1 : 1;
        }

        setIsBraking(currentSpeed.current < 0);

        if (left) {
          movement.x = 1;
        }
        if (right) {
          movement.x = -1;
        }

        if (movement.x !== 0) {
          rotationTarget.current += ROTATION_SPEED * movement.x;
        }

        if (movement.x !== 0 || movement.z !== 0) {
          vel.x =
            Math.sin(rotationTarget.current) *
            Math.abs(currentSpeed.current) *
            movement.z;
          vel.z =
            Math.cos(rotationTarget.current) *
            Math.abs(currentSpeed.current) *
            movement.z;
        }

        rb.current.setLinvel(vel, true);

        if (socket) {
          socket.emit("carMove", {
            position: rb.current.translation(),
            rotation: container.current.rotation.y,
            isPlayer1,
          });
        }
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
      if (socket) {
        socket.on("carMove", (data) => {
          if (data.isPlayer1 !== isPlayer1) {
            rb.current.setTranslation(data.position);
            container.current.rotation.y = data.rotation;
          }
        });
      }
    }, [socket, isPlayer1]);

    const respawn = () => {
      rb.current.setTranslation({ x: 0, y: -10, z: -10 });
      rb.current.setLinvel({ x: 0, y: 0, z: 0 });
      rb.current.setAngvel({ x: 0, y: 0, z: 0 });
      rotationTarget.current = 0;
      container.current.rotation.y = 0;
    };

    useImperativeHandle(ref, () => ({
      respawn,
      playVictorySound,
      playLostSound,
    }));

    return (
      <RigidBody
        colliders={false}
        lockRotations
        ref={rb}
        gravityScale={9}
        onIntersectionEnter={({ other }) => {
          if (other.rigidBodyObject.name === "raceEnd") {
            onRaceEnd(isPlayer1); // Pass isPlayer1 to onRaceEnd
          } else if (other.rigidBodyObject.name === "space") {
            respawn();
          }
        }}
      >
        <group ref={container} position={position}>
          <group ref={cameraTarget} position-z={-5.5} rotation-y={Math.PI} />
          <group ref={cameraPosition} position-y={10} position-z={18} />
          <group ref={character} rotation-y={Math.PI}>
            <Fighter
              scale={isSmallScreen ? 2.7 : 3.18}
              position-y={-0.25}
              isBraking={isBraking}
              isReversing={isReversing}
              color={color}
            />
            <CapsuleCollider args={[0.5, 3.5]} position={[0, 3, 0]} />
          </group>
        </group>
      </RigidBody>
    );
  }
);

export default PlayerController;
