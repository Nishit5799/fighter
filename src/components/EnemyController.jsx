// src/components/EnemyController.jsx
import React from "react";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import Fighter from "./Fighter";

const EnemyController = ({ position, rotation, animation }) => {
  return (
    <RigidBody
      colliders={false}
      lockRotations
      lockTranslations
      position={[position.x, position.y, position.z]}
    >
      <group rotation-y={rotation}>
        <Fighter animation={animation} position={[0, 0.6, 0]} isEnemy={true} />
      </group>
      <CapsuleCollider args={[0.45, 0.45]} position={[0, 1.5, 0]} />
    </RigidBody>
  );
};

export default EnemyController;
