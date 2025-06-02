import React, { useRef, useState, useEffect } from "react";

import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { MathUtils, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import Fighter from "./Fighter";

const normalizeAngle = (angle) => {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
};

const lerpAngle = (start, end, t) => {
  start = normalizeAngle(start);
  end = normalizeAngle(end);

  if (Math.abs(end - start) > Math.PI) {
    if (end > start) {
      start += 2 * Math.PI;
    } else {
      end += 2 * Math.PI;
    }
  }

  return normalizeAngle(start + (end - start) * t);
};

const PlayerController = ({ joystickDirection, onPunch, onKick }) => {
  const { camera } = useThree();
  const [animation, setAnimation] = useState("idle");
  const [isAttacking, setIsAttacking] = useState(false);
  const WALK_SPEED = 3;
  const ROTATION_SPEED = 0.02;

  // Refs
  const container = useRef();
  const character = useRef();
  const cameraTarget = useRef();
  const rotationTarget = useRef(0);
  const characterRotationTarget = useRef(0);
  const cameraPosition = useRef();
  const rb = useRef();
  const isMoving = useRef(false);

  // Camera refs
  const cameraWorldPosition = useRef(new Vector3());
  const cameraLookAtWorldPosition = useRef(new Vector3());
  const cameraLookAt = useRef(new Vector3());

  const [, get] = useKeyboardControls();

  // Initialize rigidbody properties
  useEffect(() => {
    if (rb.current) {
      rb.current.setLinearDamping(5);
      rb.current.setAngularDamping(5);
    }
  }, []);

  // Handle punch from mobile buttons
  useEffect(() => {
    if (onPunch && !isAttacking) {
      setIsAttacking(true);
      setAnimation("punch");
      setTimeout(() => {
        setIsAttacking(false);
        setAnimation(isMoving.current ? "run" : "idle");
      }, 800);
    }
  }, [onPunch, isAttacking]);

  // Handle kick from mobile buttons
  useEffect(() => {
    if (onKick && !isAttacking) {
      setIsAttacking(true);
      setAnimation("kick");
      setTimeout(() => {
        setIsAttacking(false);
        setAnimation(isMoving.current ? "run" : "idle");
      }, 800);
    }
  }, [onKick, isAttacking]);

  useFrame(() => {
    if (!rb.current || !container.current) return;

    const vel = rb.current.linvel();
    const movement = { x: 0, z: 0 };
    const { forward, backward, left, right, punch, kick } = get();

    // Calculate movement input
    const hasJoystickInput =
      joystickDirection &&
      (Math.abs(joystickDirection.x) > 0.1 ||
        Math.abs(joystickDirection.y) > 0.1);
    const hasKeyboardInput = forward || backward || left || right;
    const shouldMove = (hasJoystickInput || hasKeyboardInput) && !isAttacking;

    // Handle stopping
    if (!shouldMove && isMoving.current) {
      vel.x = 0;
      vel.z = 0;
      rb.current.setLinvel(vel, true);
      isMoving.current = false;
      if (!isAttacking) setAnimation("idle");

      // Sync position when stopping
      if (onMovement) {
        const position = container.current.position;
        onMovement(
          { x: position.x, y: position.y, z: position.z },
          characterRotationTarget.current
        );
      }
      return;
    }

    // Handle movement
    if (!isAttacking && shouldMove) {
      isMoving.current = true;

      // Process input sources
      if (hasJoystickInput) {
        movement.x = -joystickDirection.x;
        movement.z = -joystickDirection.y;
      } else {
        if (forward) movement.z = 1;
        if (backward) movement.z = -1;
        if (left) movement.x = 1;
        if (right) movement.x = -1;
      }

      // Normalize diagonal movement
      const inputMagnitude = Math.sqrt(
        movement.x * movement.x + movement.z * movement.z
      );
      if (inputMagnitude > 0) {
        movement.x /= inputMagnitude;
        movement.z /= inputMagnitude;
      }

      // Update rotation
      if (movement.x !== 0) {
        rotationTarget.current += ROTATION_SPEED * movement.x;
      }

      // Update animation and target rotation
      setAnimation("run");
      characterRotationTarget.current = Math.atan2(movement.x, movement.z);

      // Calculate velocity
      const moveAngle =
        rotationTarget.current + characterRotationTarget.current;
      vel.x = Math.sin(moveAngle) * WALK_SPEED;
      vel.z = Math.cos(moveAngle) * WALK_SPEED;

      // Sync movement
      if (onMovement) {
        const position = container.current.position;
        onMovement(position, characterRotationTarget.current);
      }
    }

    // Handle attacks
    if ((punch || onPunch) && !isAttacking) {
      handleAttack("punch");
    } else if ((kick || onKick) && !isAttacking) {
      handleAttack("kick");
    }

    // Apply smooth character rotation
    if (character.current) {
      character.current.rotation.y = lerpAngle(
        character.current.rotation.y,
        characterRotationTarget.current,
        0.1
      );
    }

    // Apply physics
    rb.current.setLinvel(vel, true);

    // Update camera
    updateCamera();

    // Helper function for attacks
    function handleAttack(type) {
      setIsAttacking(true);
      setAnimation(type);
      if (onAttack) onAttack(type);

      setTimeout(
        () => {
          setIsAttacking(false);
          setAnimation(isMoving.current ? "run" : "idle");

          // Sync state after attack
          if (onMovement && container.current) {
            const position = container.current.position;
            onMovement(position, characterRotationTarget.current);
          }
        },
        type === "punch" ? 800 : 900
      );
    }

    // Helper function for camera updates
    function updateCamera() {
      if (!camera || !cameraPosition.current || !cameraTarget.current) return;

      container.current.rotation.y = MathUtils.lerp(
        container.current.rotation.y,
        rotationTarget.current,
        0.1
      );

      cameraPosition.current.getWorldPosition(cameraWorldPosition.current);
      camera.position.lerp(cameraWorldPosition.current, 0.1);

      cameraTarget.current.getWorldPosition(cameraLookAtWorldPosition.current);
      cameraLookAt.current.lerp(cameraLookAtWorldPosition.current, 0.1);
      camera.lookAt(cameraLookAt.current);
    }
  });

  return (
    <RigidBody
      colliders={false}
      lockRotations
      ref={rb}
      linearDamping={5}
      angularDamping={5}
    >
      <group ref={container}>
        <group ref={cameraTarget} position={[0, 0, 1.5]} />
        <group ref={cameraPosition} position={[0, 4, -4]} />
        <group ref={character}>
          <Fighter animation={animation} position={[0, 0.6, 0]} />
        </group>
      </group>
      <CapsuleCollider args={[0.45, 0.45]} position={[0, 1.5, 0]} />
    </RigidBody>
  );
};

export default PlayerController;
