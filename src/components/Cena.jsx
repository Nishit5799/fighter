import React, { useEffect, useState } from "react";
import { useGraph } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";

export default function Cena({
  animation = "idle",

  ...props
}) {
  const group = React.useRef();
  const { scene, animations } = useGLTF("/cena.glb");
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);
  const { actions } = useAnimations(animations, group);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
  const position = isSmallScreen ? 1.0 : 0.83;

  // Debug: Log available animations
  useEffect(() => {
   
  }, [animations]);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    // Reset and fade in the selected animation, default to "idle" if no animation is provided
    actions[animation]?.reset().fadeIn(0.24).play();

    return () => actions?.[animation]?.fadeOut(0.24); // Clean up on unmount or animation change
  }, [animation, actions]);
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene" scale={0.04} position={[0, position, 0]}>
        <group
          name="node_6818f641_3858_4c92_aa22_cc0bb306df4e"
          rotation={[Math.PI / 2, 0, 0]}
        >
          <group name="node_bb51f080_2262_476c_b628_06b4d007736d">
            <group
              name="node_1d6eb569_b739_4b98_929b_1b47a39f9a2e"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <group name="node_33c7da44_8ca9_48e2_843f_1e4512a1387d">
                <group name="node_1fbb39fe_a579_4d1c_980b_b5eae92e1a2b" />
                <group name="node_a5875d48_41bc_4ea4_a827_a6ce655d9841" />
                <group name="node_c213c0a3_3da9_482f_bc22_c14b06810fe1" />
              </group>
            </group>
          </group>
        </group>
        <group name="Armature">
          <primitive object={nodes.mixamorigHips} />
          <primitive object={nodes.Ctrl_Master} />
          <primitive object={nodes.Ctrl_ArmPole_IK_Left} />
          <primitive object={nodes.Ctrl_Hand_IK_Left} />
          <primitive object={nodes.Ctrl_ArmPole_IK_Right} />
          <primitive object={nodes.Ctrl_Hand_IK_Right} />
          <primitive object={nodes.Ctrl_Foot_IK_Left} />
          <primitive object={nodes.Ctrl_LegPole_IK_Left} />
          <primitive object={nodes.Ctrl_Foot_IK_Right} />
          <primitive object={nodes.Ctrl_LegPole_IK_Right} />
          <skinnedMesh
            name="node_1fbb39fe_a579_4d1c_980b_b5eae92e1a2b_mesh0"
            geometry={
              nodes.node_1fbb39fe_a579_4d1c_980b_b5eae92e1a2b_mesh0.geometry
            }
            material={materials["mat_1.001"]}
            skeleton={
              nodes.node_1fbb39fe_a579_4d1c_980b_b5eae92e1a2b_mesh0.skeleton
            }
          />
          <skinnedMesh
            name="node_a5875d48_41bc_4ea4_a827_a6ce655d9841_mesh0"
            geometry={
              nodes.node_a5875d48_41bc_4ea4_a827_a6ce655d9841_mesh0.geometry
            }
            material={materials["mat_2.001"]}
            skeleton={
              nodes.node_a5875d48_41bc_4ea4_a827_a6ce655d9841_mesh0.skeleton
            }
          />
          <skinnedMesh
            name="node_c213c0a3_3da9_482f_bc22_c14b06810fe1_mesh0"
            geometry={
              nodes.node_c213c0a3_3da9_482f_bc22_c14b06810fe1_mesh0.geometry
            }
            material={materials["mat_0.001"]}
            skeleton={
              nodes.node_c213c0a3_3da9_482f_bc22_c14b06810fe1_mesh0.skeleton
            }
          />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload("/cena.glb");
