import React, { useEffect, useState } from "react";
import { useGraph } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";

export default function Austinn({
  animation = "idle",

  ...props
}) {
  const group = React.useRef();
  const { scene, animations } = useGLTF("/austinn.glb");
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);
  const { actions } = useAnimations(animations, group);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 640);
  const position = isSmallScreen ? 1.0 : 0.83;

  // Debug: Log available animations
  useEffect(() => {
    console.log("Available animations:", Object.keys(animations || {}));
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
      <group name="Scene" scale={0.23} position={[0, position, 0]}>
        <group
          name="node_fa4db8f5_24ac_4ab4_bbf6_653508ff73e5"
          rotation={[Math.PI / 2, 0, 0]}
        >
          <group name="node_d018ab6b_5e8c_4f11_8f1d_5551820581e7">
            <group
              name="node_89f9dc3a_d302_4be8_a8cb_010214047686"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <group name="node_dcba5340_a2e3_420b_9689_9d0480730df6">
                <group name="node_1ba5b01f_53fe_4b3c_aeec_e0fe77cc998e" />
                <group name="node_22ba7ed6_d22d_40ac_9cb7_7be0612f6294" />
                <group name="node_6145c307_6cba_4858_a9ad_0eeafb7ad657" />
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
            name="node_1ba5b01f_53fe_4b3c_aeec_e0fe77cc998e_mesh0"
            geometry={
              nodes.node_1ba5b01f_53fe_4b3c_aeec_e0fe77cc998e_mesh0.geometry
            }
            material={materials.mat_1}
            skeleton={
              nodes.node_1ba5b01f_53fe_4b3c_aeec_e0fe77cc998e_mesh0.skeleton
            }
          />
          <skinnedMesh
            name="node_22ba7ed6_d22d_40ac_9cb7_7be0612f6294_mesh0"
            geometry={
              nodes.node_22ba7ed6_d22d_40ac_9cb7_7be0612f6294_mesh0.geometry
            }
            material={materials.mat_2}
            skeleton={
              nodes.node_22ba7ed6_d22d_40ac_9cb7_7be0612f6294_mesh0.skeleton
            }
          />
          <skinnedMesh
            name="node_6145c307_6cba_4858_a9ad_0eeafb7ad657_mesh0"
            geometry={
              nodes.node_6145c307_6cba_4858_a9ad_0eeafb7ad657_mesh0.geometry
            }
            material={materials.mat_0}
            skeleton={
              nodes.node_6145c307_6cba_4858_a9ad_0eeafb7ad657_mesh0.skeleton
            }
          />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload("/austinn.glb");
