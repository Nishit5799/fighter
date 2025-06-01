import React from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";

export default function Arena(props) {
  const { nodes, materials } = useGLTF("/map.glb");
  return (
    <group {...props} dispose={null}>
      <RigidBody type="fixed" colliders="trimesh">
        <group rotation={[Math.PI / 2, -0.005, -Math.PI]}>
          <group rotation={[-Math.PI, 0, 0]} scale={0.01}>
            <group rotation={[Math.PI / 2, 0, 0]} scale={[2.08, 6.57, 2.08]}>
              <mesh
                geometry={nodes.Floor_Floor_01_0.geometry}
                material={materials.Floor_01}
                rotation={[-Math.PI / 2, 0, 0]}
              />
            </group>
          </group>
        </group>
      </RigidBody>
    </group>
  );
}

useGLTF.preload("/map.glb");
