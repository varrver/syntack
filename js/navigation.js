/**
 * SYNTACK — Navigation & Screen Management
 * Screen transitions, modal open/close, keyboard a11y, focus trapping.
 */

import { audioEngine } from "./audio.js";
import {
  animateScreenTransition,
  animateModalOpen,
  animateModalClose,
} from "./motion.js";
import { renderArchiveCards } from "./renderer.js";

let lastFocusedEl = null;

export function focusFirstFocusable(container) {
  if (!container) return;
  const focusables = container.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length) focusables[0].focus();
}

function trapFocus(container, e) {
  if (!container) return;
  const focusables = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function setupNavigation(initGameFn) {
  const splashScreen = document.getElementById("splash-screen");
  const homeScreen = document.getElementById("home-screen");
  const gameScreen = document.getElementById("game-screen");

  const btnSplashStart = document.getElementById("btn-splash-start");
  const btnMenuStart = document.getElementById("btn-menu-start");
  const btnMenuArchive = document.getElementById("btn-menu-archive");
  const btnMenuRules = document.getElementById("btn-menu-rules");
  const btnGameHome = document.getElementById("btn-game-home");

  const archiveModal = document.getElementById("archive-modal");
  const rulesModal = document.getElementById("rules-modal");
  const endOverlay = document.getElementById("end-overlay");
  const rewardOverlay = document.getElementById("reward-overlay");
  const btnCloseArchive = document.getElementById("btn-close-archive");
  const btnCloseRules = document.getElementById("btn-close-rules");

  if (btnSplashStart) {
    btnSplashStart.onclick = () => {
      audioEngine.ensureContext();
      audioEngine.playHover();
      animateScreenTransition(splashScreen, homeScreen);
    };
  }

  if (btnMenuStart) {
    btnMenuStart.onclick = () => {
      audioEngine.ensureContext();
      audioEngine.playExecuteTurn();
      animateScreenTransition(homeScreen, gameScreen, initGameFn);
    };
  }

  if (btnGameHome) {
    btnGameHome.onclick = () => {
      audioEngine.playHover();
      animateScreenTransition(gameScreen, homeScreen);
    };
  }

  if (btnMenuArchive) {
    btnMenuArchive.onclick = () => {
      audioEngine.playHover();
      renderArchiveCards();
      lastFocusedEl = document.activeElement;
      animateModalOpen(archiveModal);
      focusFirstFocusable(archiveModal);
    };
  }

  if (btnMenuRules) {
    btnMenuRules.onclick = () => {
      audioEngine.playHover();
      lastFocusedEl = document.activeElement;
      animateModalOpen(rulesModal);
      focusFirstFocusable(rulesModal);
    };
  }

  if (btnCloseArchive) {
    btnCloseArchive.onclick = () => {
      animateModalClose(archiveModal);
      if (lastFocusedEl) lastFocusedEl.focus();
    };
  }

  if (btnCloseRules) {
    btnCloseRules.onclick = () => {
      animateModalClose(rulesModal);
      if (lastFocusedEl) lastFocusedEl.focus();
    };
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" && e.key !== "Tab") return;

    if (e.key === "Escape") {
      [archiveModal, rulesModal].forEach((modal) => {
        if (modal && !modal.classList.contains("hidden")) {
          animateModalClose(modal);
          if (lastFocusedEl) lastFocusedEl.focus();
        }
      });
    }

    if (e.key === "Tab") {
      const open = [archiveModal, rulesModal, endOverlay, rewardOverlay].find(
        (m) => m && !m.classList.contains("hidden"),
      );
      if (open) trapFocus(open, e);
    }
  });
}
