// utils/audioPool.js
const soundFiles = {
  punch: "/punch.mp3",
  kick: "/kick.mp3",
  hit: "/hit.mp3",
  victory: "/victory.mp3",
  lost: "/lost.mp3",
  begin: "/begin.mp3",
};

class AudioPool {
  constructor(files) {
    this.pool = {};

    for (const key in files) {
      const audio = new Audio(files[key]);
      audio.preload = "auto";
      audio.crossOrigin = "anonymous";
      audio.volume = 0.8;
      this.pool[key] = audio;
    }
  }

  play(name, allowOverlap = true) {
    const baseAudio = this.pool[name];
    if (!baseAudio) return;

    try {
      if (allowOverlap) {
        const clone = baseAudio.cloneNode();
        clone.play().catch(() => {});
      } else {
        baseAudio.currentTime = 0;
        baseAudio.play().catch(() => {});
      }
    } catch (e) {
      console.warn(`Audio playback failed for ${name}`, e);
    }
  }

  unlockAll() {
    for (const key in this.pool) {
      try {
        const audio = this.pool[key];
        const silent = audio.cloneNode();
        silent.muted = true;
        silent.volume = 0;
        silent.play().catch(() => {});
      } catch (err) {
        console.warn(`Silent warmup failed for ${key}`, err);
      }
    }
  }
}

const audioPool = new AudioPool(soundFiles);

export default audioPool;
