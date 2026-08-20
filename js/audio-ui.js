/**
 * SYNTACK — Audio UI Controls
 * Mute toggle, volume sliders, and audio context unlock.
 */

import { audioEngine } from "./audio.js";
import { ICONS } from "./icons.js";

export function setupAudioUI() {
  const muteBtn = document.getElementById("btnMute");
  const muteHomeBtn = document.getElementById("btnMuteHome");
  const volSlider = document.getElementById("volSlider");
  const volSliderHome = document.getElementById("volSliderHome");

  const updateMuteState = (muted) => {
    [muteBtn, muteHomeBtn].forEach((btn) => {
      if (btn) {
        btn.classList.toggle("muted", muted);
        btn.querySelector(".btn-label").textContent = muted
          ? "AUDIO: OFF"
          : "AUDIO: ON";
        btn.setAttribute("aria-pressed", String(muted));
        const slot = btn.querySelector(".icon-slot");
        if (slot) slot.innerHTML = muted ? ICONS.speakerOff : ICONS.speakerOn;
      }
    });
  };

  [muteBtn, muteHomeBtn].forEach((btn) => {
    if (btn) {
      btn.onclick = () => {
        const muted = audioEngine.toggleMute();
        updateMuteState(muted);
      };
    }
  });

  [volSlider, volSliderHome].forEach((slider) => {
    if (slider) {
      slider.value = audioEngine.volume;
      slider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        audioEngine.setVolume(val);
        if (volSlider) volSlider.value = val;
        if (volSliderHome) volSliderHome.value = val;
      };
    }
  });

  updateMuteState(audioEngine.isMuted);

  function unlockAudio() {
    audioEngine.ensureContext();
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  }
  window.addEventListener("click", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
}
