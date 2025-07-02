// src/utils/sounds.js
export const sounds = {
  punch: new Audio("/punch.mp3"),
  kick: new Audio("/kick.mp3"),
  hit: new Audio("/hit.mp3"),
  fall: new Audio("/fall.mp3"),
  victory: new Audio("/victory.mp3"),
};

// Set volumes (0.0 to 1.0)
sounds.punch.volume = 0.7;
sounds.kick.volume = 0.8;
sounds.hit.volume = 0.6;
sounds.fall.volume = 0.7;
sounds.victory.volume = 0.7;

// Preload sounds
export function preloadSounds() {
  Object.values(sounds).forEach((sound) => {
    sound.load();
  });
}
