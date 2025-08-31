import React, { useRef, useEffect, useState } from "react";
import { useSocket } from "../context/SocketContext";

const AttackButtons = ({ onPunch, onKick, onToggleCamera }) => {
  const punchRef = useRef();
  const kickRef = useRef();
  const socket = useSocket();

  const [punchCooldown, setPunchCooldown] = useState(false);
  const [kickCooldown, setKickCooldown] = useState(false);
  const [firstAttackDone, setFirstAttackDone] = useState(false);

  const handleAttackStart = (type, e) => {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }

    if (!firstAttackDone) setFirstAttackDone(true);

    if (
      (type === "punch" && punchCooldown) ||
      (type === "kick" && kickCooldown)
    ) {
      return false;
    }

    if (type === "punch") {
      setPunchCooldown(true);
      onPunch(true);
      setTimeout(() => onPunch(false), 1000);
      setTimeout(() => setPunchCooldown(false), 2500);
    } else {
      setKickCooldown(true);
      onKick(true);
      setTimeout(() => onKick(false), 1000);
      setTimeout(() => setKickCooldown(false), 3000);
    }

    return true;
  };

  // Reset attack state on every new game
  useEffect(() => {
    if (!socket) return;

    const handleStartGame = () => {
      setPunchCooldown(false);
      setKickCooldown(false);
      setFirstAttackDone(false);
    };

    socket.on("startGame", handleStartGame);
    return () => {
      socket.off("startGame", handleStartGame);
    };
  }, [socket]);

  const renderButton = (type, ref, icon, isCooldown, duration) => (
    <div className="relative w-16 h-16 select-none">
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
        onClick={(e) => {
          e.preventDefault();
          !isCooldown && handleAttackStart(type, e);
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          !isCooldown && handleAttackStart(type, e);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          !isCooldown && handleAttackStart(type, e);
        }}
        style={{
          WebkitTapHighlightColor: "transparent",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          touchAction: "manipulation",
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
    <div className="fixed bottom-5 right-5 flex flex-col items-center gap-4 select-none z-[100]">
      <button
        onClick={onToggleCamera}
        className="w-16 h-16 rounded-full bg-purple-500 text-white font-bold text-xl"
      >
        🎥
      </button>
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
        button {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
};

export default AttackButtons;
