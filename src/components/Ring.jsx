import React from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";

export default function Ring(props) {
  const { nodes, materials } = useGLTF("/ring.glb");
  return (
    <group {...props} dispose={null}>
      <RigidBody type="fixed" colliders="trimesh" name="ring"  userData={{ isRing: true }} >
        <group scale={0.0024}>
          <group
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[882.048, 1043.17, 135.761]}
          >
            <mesh
              geometry={nodes.Cube_ring_0.geometry}
              // material={materials.ring}
            >
              <meshStandardMaterial
                color="#777777"
                metalness={0.7}
                roughness={0.5}
              />
            </mesh>
            <mesh
              geometry={nodes.Cube_Material001_0.geometry}
              material={materials["Material.001"]}
            />
            <mesh
              geometry={nodes.Cube_amod_0.geometry}
              material={materials.amod}
            />
            <mesh
              geometry={nodes.Cube_black_0.geometry}
              material={materials.black}
            />
          </group>
        </group>
      </RigidBody>
    </group>
  );
}

useGLTF.preload("/ring.glb");
