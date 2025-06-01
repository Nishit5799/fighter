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
    if (!rb.current) return;

    const vel = rb.current.linvel();
    const movement = { x: 0, z: 0 };
    const { forward, backward, left, right, punch, kick } = get();

    // Check if we have any movement input
    const hasJoystickInput =
      joystickDirection &&
      (Math.abs(joystickDirection.x) > 0.1 ||
        Math.abs(joystickDirection.y) > 0.1);
    const hasKeyboardInput = forward || backward || left || right;
    const shouldMove = (hasJoystickInput || hasKeyboardInput) && !isAttacking;

    // Immediately stop if no input or attacking
    if (!shouldMove && isMoving.current) {
      vel.x = 0;
      vel.z = 0;
      rb.current.setLinvel(vel, true);
      isMoving.current = false;
      if (!isAttacking) {
        setAnimation("idle");
      }
      return;
    }

    // Handle movement when not attacking
    if (!isAttacking && shouldMove) {
      isMoving.current = true;

      // Priority 1: Joystick input
      if (hasJoystickInput) {
        movement.x = -joystickDirection.x;
        movement.z = -joystickDirection.y;
      }
      // Priority 2: Keyboard input
      else {
        if (forward) movement.z = 1;
        if (backward) movement.z = -1;
        if (left) movement.x = 1;
        if (right) movement.x = -1;
      }

      // Update rotation based on movement
      if (movement.x !== 0) {
        rotationTarget.current += ROTATION_SPEED * movement.x;
      }

      // Update character state
      setAnimation("run");
      characterRotationTarget.current = Math.atan2(movement.x, movement.z);

      // Apply movement velocity
      vel.x =
        Math.sin(rotationTarget.current + characterRotationTarget.current) *
        WALK_SPEED;
      vel.z =
        Math.cos(rotationTarget.current + characterRotationTarget.current) *
        WALK_SPEED;
    }

    // Handle keyboard attack inputs
    if (punch && !isAttacking) {
      setIsAttacking(true);
      setAnimation("punch");
      setTimeout(() => {
        setIsAttacking(false);
        setAnimation(isMoving.current ? "run" : "idle");
      }, 800);
    } else if (kick && !isAttacking) {
      setIsAttacking(true);
      setAnimation("kick");
      setTimeout(() => {
        setIsAttacking(false);
        setAnimation(isMoving.current ? "run" : "idle");
      }, 800);
    }

    // Smooth character rotation
    if (character.current) {
      character.current.rotation.y = lerpAngle(
        character.current.rotation.y,
        characterRotationTarget.current,
        0.1
      );
    }

    rb.current.setLinvel(vel, true);

    // Camera controls
    if (container.current) {
      container.current.rotation.y = MathUtils.lerp(
        container.current.rotation.y,
        rotationTarget.current,
        0.1
      );
    }

    if (cameraPosition.current && camera) {
      cameraPosition.current.getWorldPosition(cameraWorldPosition.current);
      camera.position.lerp(cameraWorldPosition.current, 0.1);
    }

    if (cameraTarget.current && camera) {
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
