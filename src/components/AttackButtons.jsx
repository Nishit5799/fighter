import React, { useRef, useEffect } from "react";

const AttackButtons = ({ onPunch, onKick }) => {
  const punchRef = useRef();
  const kickRef = useRef();
  const attackInProgress = useRef(false);

  const handleAttackStart = (type) => {
    if (attackInProgress.current) return;
    attackInProgress.current = true;

    if (type === "punch") {
      onPunch(true);
      setTimeout(() => {
        onPunch(false);
        attackInProgress.current = false;
      }, 800);
    } else {
      onKick(true);
      setTimeout(() => {
        onKick(false);
        attackInProgress.current = false;
      }, 1000);
    }
  };

  useEffect(() => {
    const punchBtn = punchRef.current;
    const kickBtn = kickRef.current;
    const options = { passive: false };

    const handlePunchStart = (e) => {
      e.preventDefault();
      handleAttackStart("punch");
    };

    const handleKickStart = (e) => {
      e.preventDefault();
      handleAttackStart("kick");
    };

    punchBtn.addEventListener("touchstart", handlePunchStart, options);
    kickBtn.addEventListener("touchstart", handleKickStart, options);

    return () => {
      punchBtn.removeEventListener("touchstart", handlePunchStart);
      kickBtn.removeEventListener("touchstart", handleKickStart);
    };
  }, [onPunch, onKick]);

  return (
    <div className="fixed bottom-5 right-5 flex flex-col items-center gap-4  sm:hidden select-none user-select-none">
      <button
        ref={punchRef}
        className="w-16 h-16 rounded-full bg-blue-500 bg-opacity-70 flex items-center justify-center active:bg-opacity-100 transition-all select-none user-select-none"
        onMouseDown={() => handleAttackStart("punch")}
      >
        <span className="text-3xl">👊</span>
      </button>
      <button
        ref={kickRef}
        className="w-16 h-16 rounded-full bg-blue-500 bg-opacity-70 flex items-center justify-center active:bg-opacity-100 transition-all select-none user-select-none"
        onMouseDown={() => handleAttackStart("kick")}
      >
        <span className="text-3xl">🦵</span>
      </button>
    </div>
  );
};

export default AttackButtons;
