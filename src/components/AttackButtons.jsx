import React, { useRef, useEffect, useState } from "react";

const AttackButtons = ({ onPunch, onKick }) => {
  const punchRef = useRef();
  const kickRef = useRef();

  const [punchCooldown, setPunchCooldown] = useState(false);
  const [kickCooldown, setKickCooldown] = useState(false);

  const handleAttackStart = (type) => {
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
      setTimeout(() => setPunchCooldown(false), 1500);
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
      e.preventDefault();
      e.stopPropagation();
      const success = handlePunchStart(e);
      if (success) {
        // Add vibration if supported
        if (window.navigator.vibrate) window.navigator.vibrate(50);
        return false;
      }
      return false; // Always prevent default for iOS
    };

    const touchKickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const success = handleKickStart(e);
      if (success) {
        if (window.navigator.vibrate) window.navigator.vibrate(50);
        return false;
      }
      return false;
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
      {renderButton("punch", punchRef, "👊", punchCooldown, 1.5)}
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

        /* Base styles for all devices */
        button {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          user-select: none;
        }

        /* iOS-specific overrides and enhancements */
        @supports (-webkit-touch-callout: none) {
          button {
            -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            -webkit-user-drag: none;
          }

          /* More aggressive touch prevention for iOS */
          * {
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
            -webkit-user-drag: none !important;
            -webkit-tap-highlight-color: rgba(0, 0, 0, 0) !important;
            -webkit-tap-highlight-color: transparent !important;
            touch-action: manipulation !important;
          }

          /* Specific button states for iOS */
          button:active,
          button:focus {
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          /* Animation adjustments for iOS */
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
        }

        /* General touch improvements */
        .relative {
          position: relative;
          -webkit-overflow-scrolling: touch;
        }

        /* Prevent touch highlighting globally */
        * {
          -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
          -webkit-tap-highlight-color: transparent;
        }

        /* Button active states */
        button:active {
          transform: scale(0.95);
          transition: transform 0.1s ease;
        }

        /* Cooldown state visuals */
        button[disabled] {
          opacity: 0.6;
          transform: none !important;
        }

        /* Animation performance optimizations */
        svg {
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          perspective: 1000px;
        }
      `}</style>
    </div>
  );
};

export default AttackButtons;
