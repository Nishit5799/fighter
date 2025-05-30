"use client";
import {
  KeyboardControls,
  OrbitControls,
  OrthographicCamera,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React, { useState } from "react";

import { Physics } from "@react-three/rapier";

import PlayerController from "./components/PlayerController";
import Joystick from "./components/Joystick";
import AttackButtons from "./components/AttackButtons";
import Arena from "./components/Arena";

const keyboardMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "punch", keys: ["KeyJ"] },
  { name: "kick", keys: ["KeyK"] },
];

const Page = () => {
  const [joystickDirection, setJoystickDirection] = useState({ x: 0, y: 0 });
  const [punchPressed, setPunchPressed] = useState(false);
  const [kickPressed, setKickPressed] = useState(false);

  return (
    <>
      <div className="h-screen w-full fixed flex items-center justify-center bg-black">
        <KeyboardControls map={keyboardMap}>
          <Canvas camera={{ position: [0, 3, 3], fov: 60, near: 1 }} shadows>
            <ambientLight intensity={3} />
            <OrthographicCamera left={-22} right={15} top={10} bottom={-20} />
            <Physics>
              <PlayerController
                joystickDirection={joystickDirection}
                onPunch={punchPressed}
                onKick={kickPressed}
              />
              {/* <Map /> */}
              <Arena />
            </Physics>
          </Canvas>
        </KeyboardControls>

        <Joystick onMove={setJoystickDirection} />
        <AttackButtons onPunch={setPunchPressed} onKick={setKickPressed} />
      </div>
    </>
  );
};

export default Page;
