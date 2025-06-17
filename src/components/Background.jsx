import { useTexture } from "@react-three/drei";
import React from "react";

const Background = () => {
  const texture = useTexture("/bg.jpg"); // Replace with the path to your image in the public directory
  return (
    <mesh>
      {/* Rotate the sphere 90 degrees (Math.PI / 2 radians) on the Y-axis */}
      <sphereGeometry args={[500, 32, 32]} />
      {/* Large sphere to wrap the scene */}
      <meshStandardMaterial map={texture} side={2} /> {/* Apply the texture */}
    </mesh>
  );
};

export default Background;
