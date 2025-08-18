import React, { useRef, useEffect, useState } from "react";

const AttackButtons = ({ onPunch, onKick }) => {
  const punchRef = useRef();
  const kickRef = useRef();

  const [punchCooldown, setPunchCooldown] = useState(false);
  const [kickCooldown, setKickCooldown] = useState(false);

  const handleAttackStart = (type) => {
    console.log(`[iOS Touch] ${type} button pressed`);
    if (
      (type === "punch" && punchCooldown) ||
      (type === "kick" && kickCooldown)
    ) {
      return false; // Return false if attack is blocked by cooldown
    }

    if (type === "punch") {
      setPunchCooldown(true);
      onPunch(true); // Trigger punch state
      setTimeout(() => onPunch(false), 1000); // Reset after 1 second
      setTimeout(() => setPunchCooldown(false), 2500);
      return true;
    } else {
      setKickCooldown(true);
      onKick(true); // Trigger kick state
      setTimeout(() => onKick(false), 1000); // Reset after 1 second
      setTimeout(() => setKickCooldown(false), 3000);
      return true;
    }
  };

  // Event handlers that return whether attack was successful
  const handlePunchStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return handleAttackStart("punch");
  };

  const handleKickStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return handleAttackStart("kick");
  };

  useEffect(() => {
    const punchBtn = punchRef.current;
    const kickBtn = kickRef.current;

    if (!punchBtn || !kickBtn) return;

    const options = { passive: false, capture: true };

    const touchPunchHandler = (e) => {
      const success = handlePunchStart(e);
      if (success) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      return true;
    };

    const touchKickHandler = (e) => {
      const success = handleKickStart(e);
      if (success) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      return true;
    };
    punchBtn.addEventListener("touchstart", touchPunchHandler, options);
    punchBtn.addEventListener("mousedown", handlePunchStart);

    kickBtn.addEventListener("touchstart", touchKickHandler, options);
    kickBtn.addEventListener("mousedown", handleKickStart);

    return () => {
      punchBtn.removeEventListener("touchstart", touchPunchHandler, options);
      punchBtn.removeEventListener("mousedown", handlePunchStart);

      kickBtn.removeEventListener("touchstart", touchKickHandler, options);
      kickBtn.removeEventListener("mousedown", handleKickStart);
    };
  }, [punchCooldown, kickCooldown]);

  const renderButton = (type, ref, icon, isCooldown, duration) => (
    <div className="relative w-16 h-16">
      {/* GREEN STATIC BORDER */}
      <svg
        className="absolute top-0 left-0 w-16 h-16 pointer-events-none"
        viewBox="0 0 36 36"
      >
        <circle
          stroke="limegreen"
          strokeWidth="3"
          fill="transparent"
          r="16"
          cx="18"
          cy="18"
        />
      </svg>

      {/* RED ANIMATED RING */}
      {isCooldown && (
        <svg
          className="absolute top-0 left-0 w-16 h-16 pointer-events-none"
          viewBox="0 0 36 36"
        >
          <circle
            stroke="red"
            strokeWidth="3"
            fill="transparent"
            r="16"
            cx="18"
            cy="18"
            style={{
              strokeDasharray: 100,
              strokeDashoffset: 100,
              transform: "rotate(-90deg)",
              transformOrigin: "center",
              animation: `progressAnim-${type} ${duration}s linear forwards`,
            }}
          />
        </svg>
      )}

      <button
        ref={ref}
        disabled={isCooldown}
        className={`w-16 h-16 rounded-full bg-blue-500 bg-opacity-70 flex items-center justify-center 
          active:bg-opacity-100 transition-all select-none user-select-none
          ${isCooldown ? "opacity-50 cursor-not-allowed" : ""}`}
        onMouseDown={() => !isCooldown && handleAttackStart(type)}
        style={{
          WebkitTapHighlightColor: "transparent",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          touchAction: "manipulation",
          // Correct React syntax for webkit prefixes:
          WebkitOverflowScrolling: "touch",
          WebkitUserDrag: "none",
        }}
      >
        <span className="text-2xl font-bold">
          {isCooldown ? "Cooling" : icon}
        </span>
      </button>
    </div>
  );

  return (
    <div className="fixed bottom-5 right-5 flex flex-col items-center gap-4 sm:hidden select-none user-select-none z-[100]">
      {renderButton("punch", punchRef, "👊", punchCooldown, 2.5)}
      {renderButton("kick", kickRef, "🦵", kickCooldown, 3)}

      <style jsx>{`
        @keyframes progressAnim-punch {
          from {
            stroke-dashoffset: 100;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes progressAnim-kick {
          from {
            stroke-dashoffset: 100;
          }
          to {
            stroke-dashoffset: 0;
          }
        }

        /* iOS-specific improvements */
        button {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        /* Prevent touch highlighting */
        * {
          -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
};

export default AttackButtons;
