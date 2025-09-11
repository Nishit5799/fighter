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
Fight your opponent in the arena and win by knocking them out.

Mobile Controls:
- Move using the on-screen joystick.
- Rotate by swiping or using the joystick.
- Tap punch and kick buttons to attack.
- Change rotation speed from the settings (⚙️) after the game starts.
- Switch between FPP and TPP using the button above the joystick.
- Punch, kick, and run actions have cooldowns. Wait before using them again.
`;

  return (
    <>
      <div className="fixed top-[20%] left-4 ">
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
