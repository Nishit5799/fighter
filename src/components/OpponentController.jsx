// src/components/OpponentController.jsx
import React from "react";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import Fighter from "./Fighter";

const OpponentController = ({ position, rotation, animation }) => {
  return (
    <RigidBody
      colliders={false}
      lockRotations
      lockTranslations
      position={position}
    >
      <group rotation-y={rotation}>
        <group position={[0, 0.6, 0]}>
          <Fighter animation={animation} />
        </group>
      </group>
      <CapsuleCollider args={[0.45, 0.45]} position={[0, 1.5, 0]} />
    </RigidBody>
  );
};

export default OpponentController;
