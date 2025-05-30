import React, { useRef, useEffect } from "react";

const Joystick = ({ onMove }) => {
  const joystickRef = useRef(null);
  const thumbstickRef = useRef(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const touchIdRef = useRef(null);

  const handleTouchStart = (e) => {
    if (touchIdRef.current !== null) return;

    const touch = e.touches[0];
    touchIdRef.current = touch.identifier;
    const rect = joystickRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    e.preventDefault();
  };

  const handleTouchMove = (e) => {
    if (touchIdRef.current === null) return;

    const touch = Array.from(e.touches).find(
      (t) => t.identifier === touchIdRef.current
    );
    if (!touch) return;

    const deltaX = touch.clientX - centerRef.current.x;
    const deltaY = touch.clientY - centerRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = joystickRef.current.offsetWidth / 2;
    const force = Math.min(distance / maxDistance, 1);

    const angle = Math.atan2(deltaY, deltaX);
    const thumbstickX = Math.cos(angle) * force * maxDistance;
    const thumbstickY = Math.sin(angle) * force * maxDistance;

    thumbstickRef.current.style.transform = `translate(${thumbstickX}px, ${thumbstickY}px)`;

    // Normalize to -1 to 1 range
    onMove({
      x: deltaX / maxDistance,
      y: deltaY / maxDistance,
    });

    e.preventDefault();
  };

  const handleTouchEnd = () => {
    touchIdRef.current = null;
    thumbstickRef.current.style.transform = "translate(0, 0)";
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
  }, []); // Empty dependency array ensures this runs only once

  return (
    <div
      ref={joystickRef}
      className="fixed bottom-5 left-5 w-24 h-24 rounded-full bg-white bg-opacity-50 touch-none flex items-center justify-center sm:block md:hidden select-none"
    >
      <div
        ref={thumbstickRef}
        className="w-10 h-10 rounded-full bg-black bg-opacity-50 select-none transform transition-transform duration-100 ease-out"
      ></div>
    </div>
  );
};

export default Joystick;
