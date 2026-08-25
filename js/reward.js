/**
 * SYNTACK — Reward & End Overlays
 * Reward screen (between nodes), end-game overlay (victory/defeat),
 * and the end-overlay "run again" wiring.
 */

import { player, run, deck, setDeck, gameOver, setGameOver } from "./state.js";
import { CARD_TYPES } from "./cards.js";
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

/**
 * Card reward — offers 3 distinct primitives; the picked card's id is
 * appended to the run deck, then continueFn advances to the next node.
 */
export function showCardReward(continueFn) {
  const overlay = document.getElementById("cardpick-overlay");
  const options = document.getElementById("cardpick-options");
  if (!overlay || !options) {
    continueFn();
    return;
  }

  const pool = [...CARD_TYPES];
  const offers = [];
  while (offers.length < 3 && pool.length) {
    offers.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }

  options.replaceChildren();
  offers.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `card type-${card.type} w-[128px] h-[175px] p-2 flex flex-col justify-between relative border-0 cursor-pointer text-left hover:-translate-y-1.5 transition-transform`;
    btn.setAttribute("aria-label", `Add ${card.code} to deck — ${card.desc}`);
    btn.innerHTML = `
      <div class="flex justify-start items-center w-full z-10 px-0.5 pt-0.5">
        <span class="card-ram text-[0.52rem] bg-black/85 text-balatro-blue font-pixel font-bold px-1 py-0.5 rounded border border-balatro-blue/40 shadow-sm">${card.ram} RAM</span>
      </div>
      <div class="card-body-frame my-auto flex flex-col items-center justify-center px-1 z-10">
        <div class="card-code text-[0.76rem] text-white font-bold font-mono text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] leading-tight">${card.code}</div>
        <div class="card-desc text-[0.55rem] text-white/85 leading-tight text-center mt-1 font-sans">${card.desc}</div>
      </div>
      <div class="card-footer-type text-[0.48rem] font-pixel tracking-wider text-center uppercase text-white/60 z-10 pb-0.5">${card.type}</div>
    `;
    btn.onclick = () => {
      audioEngine.playExecuteTurn();
      setDeck([...deck, card.id]);
      log(`[SYS] Compiled '${card.code}' into cache — ${deck.length} cards.`, "system");

      // Pick feedback beat: lift the chosen card, dim the rest, then move on
      options.querySelectorAll("button").forEach((b) => {
        b.disabled = true;
        b.style.pointerEvents = "none";
        if (b !== btn) b.style.opacity = "0.2";
      });
      btn.style.transform = "translateY(-10px) scale(1.06)";
      btn.style.outline = "3px solid rgba(52, 211, 153, 0.9)";
      btn.style.outlineOffset = "2px";

      setTimeout(() => {
        hideCardReward();
        continueFn();
      }, 450);
    };
    options.appendChild(btn);
  });

  overlay.classList.remove("hidden");
  setTimeout(() => focusFirstFocusable(overlay), 50);
}

export function hideCardReward() {
  const overlay = document.getElementById("cardpick-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
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
