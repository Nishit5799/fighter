import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

const Joystick = forwardRef(
  (
    { onMove, onStart = () => {}, disabled, onToggleRun, onToggleCamera },
    ref
  ) => {
    const joystickRef = useRef(null);
    const thumbstickRef = useRef(null);
    const runButtonRef = useRef(null);
    const touchIdRef = useRef(null);

    const centerRef = useRef({ x: 0, y: 0 });

    const [thumbstickPosition, setThumbstickPosition] = useState({
      x: 0,
      y: 0,
    });

    const [isRunning, setIsRunning] = useState(false);
    const [runState, setRunState] = useState("ready"); // 'ready' | 'running' | 'cooldown'
    const [runCountdown, setRunCountdown] = useState(null); // 5 → 4 → ... → 1
    const [isFpp, setIsFpp] = useState(false);

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
            isRunning,
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
      onMove({ x: 0, y: 0, isRunning });
    };

    const triggerRun = () => {
      if (runState !== "ready") return;

      setRunState("running");
      setIsRunning(true);
      if (onToggleRun) onToggleRun(true);

      let count = 5;
      setRunCountdown(count);

      const countdownInterval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setRunCountdown(count);
        } else {
          clearInterval(countdownInterval);
          setRunCountdown(null);
          setIsRunning(false);
          if (onToggleRun) onToggleRun(false);
          setRunState("cooldown");

          // Begin cooldown for 5s
          setTimeout(() => {
            setRunState("ready");
          }, 5000);
        }
      }, 1000);
    };

    useEffect(() => {
      const joystickElement = joystickRef.current;
      const runButtonElement = runButtonRef.current;
      const options = { passive: false };

      joystickElement.addEventListener("touchstart", handleTouchStart, options);
      joystickElement.addEventListener("touchmove", handleTouchMove, options);
      joystickElement.addEventListener("touchend", handleTouchEnd, options);
      runButtonElement.addEventListener("touchstart", triggerRun, options);

      return () => {
        joystickElement.removeEventListener("touchstart", handleTouchStart);
        joystickElement.removeEventListener("touchmove", handleTouchMove);
        joystickElement.removeEventListener("touchend", handleTouchEnd);
        runButtonElement.removeEventListener("touchstart", triggerRun);
      };
    }, [runState]);

    const isButtonDisabled = runState !== "ready";

    const renderRunLabel = () => {
      if (runCountdown !== null) return runCountdown;
      if (runState === "cooldown") return "COOLING";
      return "RUN";
    };

    // ✅ Expose joystick touch ID to parent
    useImperativeHandle(ref, () => ({
      getTouchId: () => touchIdRef.current,
    }));

    return (
      <>
        <div className="fixed bottom-5 left-5 flex flex-col items-center gap-4">
          <button
            onClick={() => {
              setIsFpp(!isFpp);
              onToggleCamera();
            }}
            className="font-[Bebas] w-14 h-14 sm:w-16 sm:h-16 rounded-full left-2 bg-purple-500 text-white font-bold text-sm sm:text-xl"
          >
            {isFpp ? "TPP" : "FPP"}
          </button>
          <div
            ref={joystickRef}
            className="w-30 h-30 rounded-full bg-white bg-opacity-50 touch-none flex items-center justify-center select-none user-select-none"
          >
            <div
              ref={thumbstickRef}
              className="w-12 h-12 rounded-full bg-black bg-opacity-50 select-none user-select-none transform transition-transform duration-100 ease-out"
              style={{
                transform: `translate(${thumbstickPosition.x}px, ${thumbstickPosition.y}px)`,
              }}
            ></div>
          </div>
        </div>

        <div className="fixed bottom-[27%] right-5 flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            {/* Red cooldown circle only during cooldown */}
            {runState === "cooldown" && (
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
                    animation: "run-cooldown 5s linear forwards",
                  }}
                />
              </svg>
            )}

            <button
              ref={runButtonRef}
              disabled={isButtonDisabled}
              className={`w-16 h-16 rounded-full ${
                runState === "running" ? "bg-green-600" : "bg-gray-600"
              } bg-opacity-80 flex items-center justify-center text-white 
    ${runState !== "ready" ? "opacity-100 cursor-not-allowed" : ""}
    active:bg-opacity-100 transition-all select-none user-select-none`}
              onClick={triggerRun}
            >
              <span className="font-[Bebas] text-2xl font-bold">
                {renderRunLabel()}
              </span>
            </button>
          </div>
        </div>

        <style jsx>{`
          @keyframes run-cooldown {
            from {
              stroke-dashoffset: 100;
            }
            to {
              stroke-dashoffset: 0;
            }
          }
        `}</style>
      </>
    );
  }
);

export default Joystick;
