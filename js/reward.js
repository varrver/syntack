/**
 * SYNTACK — Reward & End Overlays
 * Reward screen (between nodes), end-game overlay (victory/defeat),
 * and the end-overlay "run again" wiring.
 */

import { player, run, gameOver, setGameOver } from "./state.js";
import { audioEngine } from "./audio.js";
import { log } from "./renderer.js";
import { focusFirstFocusable } from "./navigation.js";

export function showEndOverlay(isVictory, subText) {
  const overlay = document.getElementById("end-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  overlay.classList.add("flex");
  overlay.classList.toggle("victory", isVictory);
  overlay.classList.toggle("defeat", !isVictory);

  const title = document.getElementById("end-overlay-title");
  const chip = document.getElementById("end-overlay-chip");
  const sub = document.getElementById("end-overlay-sub");
  if (title) {
    title.textContent = isVictory ? "VICTORY" : "SYSTEM FAILURE";
    title.setAttribute("data-text", title.textContent);
  }
  if (chip) chip.textContent = isVictory ? "HACK COMPLETE" : "CONNECTION LOST";
  if (sub) sub.textContent = subText;

  const again = document.getElementById("btn-end-again");
  if (again) setTimeout(() => again.focus(), 50);
}

export function hideEndOverlay() {
  const overlay = document.getElementById("end-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("flex");
}

export function wireEndOverlay(initGameFn) {
  const again = document.getElementById("btn-end-again");
  if (again) {
    again.onclick = () => {
      audioEngine.playExecuteTurn();
      hideEndOverlay();
      initGameFn();
    };
  }
}

export function showRewardOverlay() {
  const overlay = document.getElementById("reward-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  overlay.classList.add("flex");
  const healBtn = document.getElementById("btn-reward-heal");
  if (healBtn) healBtn.disabled = player.hp >= player.maxHp;
  setTimeout(() => focusFirstFocusable(overlay), 50);
}

export function hideRewardOverlay() {
  const overlay = document.getElementById("reward-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("flex");
}

export function wireRewardOverlay(startNextNodeFn) {
  const REWARDS = [
    ["btn-reward-heal", "heal", "+15 HP — REPAIR"],
    ["btn-reward-ram", "ram", "+1 MAX RAM — OVERCLOCK"],
    ["btn-reward-hp", "hp", "+10 MAX HP — UPLINK"],
  ];
  REWARDS.forEach(([id, kind, label]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.onclick = () => {
        audioEngine.playExecuteTurn();
        if (kind === "heal") {
          player.hp = Math.min(player.maxHp, player.hp + 15);
        } else if (kind === "ram") {
          player.maxRam = Math.min(7, player.maxRam + 1);
          player.ram = player.maxRam;
        } else if (kind === "hp") {
          player.maxHp = Math.min(99, player.maxHp + 10);
          player.hp = Math.min(player.maxHp, player.hp + 10);
        }
        log(`[REWARD] ${label} applied.`, "info");
        hideRewardOverlay();
        startNextNodeFn();
        const firstCard = document.querySelector("#hand-container .card");
        if (firstCard) firstCard.focus();
      };
    }
  });
}
