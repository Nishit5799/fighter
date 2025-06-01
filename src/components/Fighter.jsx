import React, { useEffect } from "react";
import { useGraph } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";

export default function Fighter({
  animation = "idle",

  ...props
}) {
  const group = React.useRef();
  const { scene, animations } = useGLTF("/fighter.glb");
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    // Reset and fade in the selected animation, default to "idle" if no animation is provided
    actions[animation]?.reset().fadeIn(0.24).play();

    return () => actions?.[animation]?.fadeOut(0.24); // Clean up on unmount or animation change
  }, [animation, actions]);
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene" scale={0.7}>
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
            name="Ch43"
            geometry={nodes.Ch43.geometry}
            material={materials.Ch43_Body}
            skeleton={nodes.Ch43.skeleton}
          />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload("/fighter.glb");
