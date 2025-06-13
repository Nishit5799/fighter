import React, { useRef, useState, useEffect } from "react";

const Joystick = ({ onMove, onStart = () => {}, disabled }) => {
  const joystickRef = useRef(null);
  const thumbstickRef = useRef(null);
  const touchIdRef = useRef(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const [thumbstickPosition, setThumbstickPosition] = useState({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    e.preventDefault();
    if (touchIdRef.current === null) {
      const touch = e.touches[0];
      touchIdRef.current = touch.identifier;
      const rect = joystickRef.current.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (touchIdRef.current !== null) {
      const touch = Array.from(e.touches).find(
        (t) => t.identifier === touchIdRef.current
      );
      if (touch) {
        const deltaX = touch.clientX - centerRef.current.x;
        const deltaY = touch.clientY - centerRef.current.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = joystickRef.current.offsetWidth / 2;

        const angle = Math.atan2(deltaY, deltaX);
        const force = Math.min(distance / maxDistance, 1);

        const thumbstickX = Math.cos(angle) * force * maxDistance;
        const thumbstickY = Math.sin(angle) * force * maxDistance;

        setThumbstickPosition({ x: thumbstickX, y: thumbstickY });

        const isBackward = deltaY > 0;
        onMove({
          x: isBackward ? -Math.cos(angle) * force : -Math.cos(angle) * force,
          y: Math.sin(angle) * force,
        });

        if (deltaY < 0) {
          onStart();
        }
      }
    }
  };

  const handleTouchEnd = () => {
    touchIdRef.current = null;
    setThumbstickPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  };

  useEffect(() => {
    const joystickElement = joystickRef.current;
    const options = { passive: false };

    joystickElement.addEventListener("touchstart", handleTouchStart, options);
    joystickElement.addEventListener("touchmove", handleTouchMove, options);
    joystickElement.addEventListener("touchend", handleTouchEnd, options);

    return () => {
      joystickElement.removeEventListener("touchstart", handleTouchStart);
      joystickElement.removeEventListener("touchmove", handleTouchMove);
      joystickElement.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return (
    <div
      ref={joystickRef}
      className="fixed bottom-5 left-5 w-32 h-32 rounded-full bg-white bg-opacity-50 touch-none flex items-center justify-center  sm:hidden select-none user-select-none"
    >
      <div
        ref={thumbstickRef}
        className="w-12 h-12 rounded-full bg-black bg-opacity-50 select-none user-select-none transform transition-transform duration-100 ease-out"
        style={{
          transform: `translate(${thumbstickPosition.x}px, ${thumbstickPosition.y}px)`,
        }}
      ></div>
    </div>
  );
};

export default Joystick;
