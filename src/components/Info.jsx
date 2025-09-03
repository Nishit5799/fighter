// src/components/Info.jsx
import React from "react";

const Info = ({
  showInfoPopup,
  setShowInfoPopup,
  onInfoClick,
  toggleSettings,
}) => {
  const infoMessage = `
    Fight your opponent in the arena! Complete the round by eliminating them.

    Controls:
    - Desktop: 
      * Movement: W, A, S, D or Arrow Keys
      * Punch: J
      * Kick: K
    - Mobile: 
      * Use the on-screen joystick for movement
      * Use the attack buttons for punches and kicks
  `;

  return (
    <>
      <div className="fixed sm:top-5 sm:left-1/2 right-[80%] top-[20%] transform -translate-x-1/2">
        <button
          onClick={toggleSettings}
          aria-label="Open settings"
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gray-800/90 text-white shadow-md
                   hover:bg-gray-700 active:scale-95 transition flex items-center justify-center"
        >
          {/* Gear icon (SVG) */}
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M19.14,12.94a7.54,7.54,0,0,0,.05-.94,7.54,7.54,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.65l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.28,7.28,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,13,1H11a.5.5,0,0,0-.49.41L10.1,4.06a7.28,7.28,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.65L3.7,11.06a7.54,7.54,0,0,0-.05.94,7.54,7.54,0,0,0,.05.94L1.59,14.59a.5.5,0,0,0-.12.65l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.28,7.28,0,0,0,1.63.94l.38,2.65A.5.5,0,0,0,11,23h2a.5.5,0,0,0,.49-.41l.41-2.65a7.28,7.28,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0-.12-.65ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />
          </svg>
        </button>
      </div>

      {showInfoPopup && (
        <div className="fixed inset-0 flex items-center justify-center text-center bg-black bg-opacity-50 z-[100]">
          <div className="bg-white p-6 rounded-lg text-black max-w-md">
            <h2 className="text-xl font-bold mb-4">Game Information</h2>
            <p className="whitespace-pre-line">{infoMessage}</p>
            <button
              onClick={() => setShowInfoPopup(false)}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Info;
