import React, { useRef, useEffect } from "react";

const AttackButtons = ({ onPunch, onKick }) => {
  const punchRef = useRef();
  const kickRef = useRef();

  useEffect(() => {
    const punchBtn = punchRef.current;
    const kickBtn = kickRef.current;
    const options = { passive: false }; // Mark as non-passive

    const handlePunchStart = (e) => {
      e.preventDefault();
      onPunch(true);
    };

    const handlePunchEnd = (e) => {
      e.preventDefault();
      onPunch(false);
    };

    const handleKickStart = (e) => {
      e.preventDefault();
      onKick(true);
    };

    const handleKickEnd = (e) => {
      e.preventDefault();
      onKick(false);
    };

    // Add event listeners with non-passive option
    punchBtn.addEventListener("touchstart", handlePunchStart, options);
    punchBtn.addEventListener("touchend", handlePunchEnd, options);
    punchBtn.addEventListener("touchcancel", handlePunchEnd, options);

    kickBtn.addEventListener("touchstart", handleKickStart, options);
    kickBtn.addEventListener("touchend", handleKickEnd, options);
    kickBtn.addEventListener("touchcancel", handleKickEnd, options);

    return () => {
      // Cleanup
      punchBtn.removeEventListener("touchstart", handlePunchStart);
      punchBtn.removeEventListener("touchend", handlePunchEnd);
      punchBtn.removeEventListener("touchcancel", handlePunchEnd);

      kickBtn.removeEventListener("touchstart", handleKickStart);
      kickBtn.removeEventListener("touchend", handleKickEnd);
      kickBtn.removeEventListener("touchcancel", handleKickEnd);
    };
  }, [onPunch, onKick]);

  return (
    <div className="fixed bottom-5 right-5 flex flex-col items-center gap-4 sm:block md:hidden select-none user-select-none">
      <button
        ref={punchRef}
        className="w-16 h-16 rounded-full bg-blue-500 bg-opacity-70 flex items-center justify-center active:bg-opacity-100 transition-all select-none user-select-none"
        onMouseDown={() => onPunch(true)}
        onMouseUp={() => onPunch(false)}
        onMouseLeave={() => onPunch(false)}
      >
        <span className="text-3xl">👊</span>
      </button>
      <button
        ref={kickRef}
        className="w-16 h-16 rounded-full bg-blue-500 bg-opacity-70 flex items-center justify-center active:bg-opacity-100 transition-all select-none user-select-none"
        onMouseDown={() => onKick(true)}
        onMouseUp={() => onKick(false)}
        onMouseLeave={() => onKick(false)}
      >
        <span className="text-3xl">🦵</span>
      </button>
    </div>
  );
};

export default AttackButtons;
