/**
 * SYNTACK — DOM Renderer
 * Terminal logging, card hand rendering, archive cards, and UI updates.
 */

import { player, enemy, hand } from "./state.js";
import { CARD_TYPES } from "./cards.js";
import { audioEngine } from "./audio.js";
import { animateHandStagger } from "./motion.js";

export function resetTerminal() {
  const term = document.getElementById("terminal");
  if (!term) return;
  term.innerHTML = "";
  const cursor = document.createElement("span");
  cursor.className = "terminal-cursor";
  cursor.setAttribute("aria-hidden", "true");
  term.appendChild(cursor);
}

export function log(msg, type) {
  const term = document.getElementById("terminal");
  if (!term) return;

  const line = document.createElement("div");
  let colorClass = "text-balatro-green";
  if (type === "player") colorClass = "text-balatro-blue";
  if (type === "system") colorClass = "text-balatro-red";
  if (type === "warning") colorClass = "text-balatro-yellow";
  if (type === "info") colorClass = "text-balatro-green";

  line.className = `terminal-log opacity-0 mb-[2px] ${colorClass}`;
  line.innerText = `> ${msg}`;
  const cursor = term.querySelector(".terminal-cursor");
  term.insertBefore(line, cursor);
  term.scrollTop = term.scrollHeight;
}

export function renderHand(playCardFn) {
  const container = document.getElementById("hand-container");
  if (!container) return;
  container.innerHTML = "";

  hand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    let rarityBorder = "border-[#3b3f6b]";
    let stickerClass = "common";

    if (card.rarity === "rare") {
      rarityBorder = "border-balatro-purple";
      stickerClass = "rare";
    } else if (card.rarity === "epic") {
      rarityBorder = "border-balatro-yellow";
      stickerClass = "epic";
    }

    cardEl.className = `card type-${card.type} min-w-[110px] sm:min-w-[130px] h-[145px] sm:h-[160px] p-2 cursor-pointer shrink-0 flex flex-col justify-between relative border-2 ${rarityBorder}`;
    cardEl.setAttribute("role", "button");
    cardEl.setAttribute("tabindex", "0");
    cardEl.setAttribute("aria-label", `${card.code} — ${card.desc}`);

    cardEl.innerHTML = `
      <div class="flex justify-between items-center w-full">
        <span class="card-ram text-[0.6rem] bg-balatro-blue text-black font-pixel font-bold px-[4px] py-[1px] rounded">${card.ram} RAM</span>
        <span class="card-sticker ${stickerClass}">${card.rarity}</span>
      </div>
      <div class="card-code text-[0.7rem] sm:text-[0.8rem] text-white font-bold font-mono my-2 leading-[1.2] text-center">${card.code}</div>
      <div class="card-desc text-[0.55rem] text-white/60 leading-[1.2] text-center">${card.desc}</div>
    `;

    cardEl.addEventListener("mouseenter", () => {
      audioEngine.playHover();
    });

    cardEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playCardFn(index, cardEl);
      }
    });

    cardEl.onclick = () => playCardFn(index, cardEl);
    container.appendChild(cardEl);
  });

  animateHandStagger(container);
}

export function renderArchiveCards() {
  const container = document.getElementById("archive-cards-list");
  if (!container) return;
  container.innerHTML = "";

  CARD_TYPES.forEach((card) => {
    const cardEl = document.createElement("div");
    let rarityBorder = "border-[#3b3f6b]";
    let stickerClass = "common";

    if (card.rarity === "rare") {
      rarityBorder = "border-balatro-purple";
      stickerClass = "rare";
    } else if (card.rarity === "epic") {
      rarityBorder = "border-balatro-yellow";
      stickerClass = "epic";
    }

    cardEl.className = `card type-${card.type} h-[130px] p-2 flex flex-col justify-between relative border-2 ${rarityBorder}`;
    cardEl.setAttribute("role", "listitem");
    cardEl.innerHTML = `
      <div class="flex justify-between items-center w-full">
        <span class="card-ram text-[0.55rem] bg-balatro-blue text-black font-pixel font-bold px-[3px] py-[1px] rounded">${card.ram} RAM</span>
        <span class="card-sticker ${stickerClass}">${card.rarity}</span>
      </div>
      <div class="card-code text-[0.65rem] text-white font-bold font-mono text-center">${card.code}</div>
      <div class="card-desc text-[0.5rem] text-white/60 text-center">${card.desc}</div>
    `;
    container.appendChild(cardEl);
  });
}

export function updateUI() {
  document.getElementById("player-hp").innerText =
    `${player.hp}/${player.maxHp}`;
  const hpPct = Math.min(1, Math.max(0, player.hp / player.maxHp));
  const hpFill = document.getElementById("hpBarFill");
  if (hpFill) {
    hpFill.style.transform = `scaleX(${hpPct})`;
  }

  document.getElementById("player-ram").innerText =
    `${player.ram}/${player.maxRam}`;
  document.getElementById("ramBarFill").style.transform =
    `scaleX(${Math.min(1, Math.max(0, player.ram / player.maxRam))})`;
  document.getElementById("var-x").innerText = player.varX;
  document.getElementById("player-block").innerText = player.block;
  document.getElementById("ramDisplay").innerText =
    `RAM: ${player.ram}/${player.maxRam}`;

  document.getElementById("enemy-hp").innerText = `${enemy.hp}/${enemy.maxHp}`;
  document.getElementById("enemyHpFill").style.transform =
    `scaleX(${Math.min(1, Math.max(0, enemy.hp / enemy.maxHp))})`;
}
