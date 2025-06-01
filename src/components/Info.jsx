// src/components/Info.jsx
import React from "react";

const Info = ({ showInfoPopup, setShowInfoPopup, onInfoClick }) => {
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
      <div className="fixed sm:top-5 sm:left-1/2 right-[80%] top-[2.2%] transform -translate-x-1/2">
        <button
          onClick={onInfoClick}
          className="bg-blue-500 text-white px-4 py-2 rounded-full"
        >
          i
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
