// src/components/Info.jsx
import React from "react";

const Info = ({
  showInfoPopup,
  setShowInfoPopup,
  onInfoClick,
  toggleSettings,
  settingsButtonRef,
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
      <div className="fixed top-[40%] left-4 ">
        <button
          ref={settingsButtonRef}
          onClick={toggleSettings}
          className="bg-gray-800 text-white px-4 py-2 rounded-md shadow-md hover:bg-gray-700 transition"
        >
          ⚙️
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
