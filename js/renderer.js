/**
 * SYNTACK — DOM Renderer
 * Terminal logging, card hand rendering, archive cards, and UI updates.
 */

import { player, enemy, hand } from "./state.js";
import { CARD_TYPES } from "./cards.js";
import { audioEngine } from "./audio.js";
import { animateHandStagger } from "./motion.js";

let _termEl = null;
let _cursorEl = null;

/* ── Enemy sprite mapping ────────────────────────────────────────── */
const _ENEMY_SPRITE_CLASS = {
  "FIREWALL DAEMON": "sprite-daemon",
  "INTRUSION WRAITH": "sprite-wraith",
  "LOGIC BOMBER": "sprite-bomber",
  "MAINFRAME CORE": "sprite-core",
};
let _lastSpriteClass = "";

export function updateEnemySprite(enemyName) {
  const el = document.getElementById("enemy-sprite");
  if (!el) return;
  const cls = _ENEMY_SPRITE_CLASS[enemyName] || "sprite-daemon";
  if (cls === _lastSpriteClass) return;
  el.classList.remove("sprite-daemon", "sprite-wraith", "sprite-bomber", "sprite-core");
  el.classList.add(cls);
  _lastSpriteClass = cls;
}

export function resetTerminal() {
  _termEl = document.getElementById("terminal");
  if (!_termEl) return;
  _termEl.innerHTML = "";
  _cursorEl = document.createElement("span");
  _cursorEl.className = "terminal-cursor";
  _cursorEl.setAttribute("aria-hidden", "true");
  _termEl.appendChild(_cursorEl);
}

export function log(msg, type) {
  if (!_termEl) return;

  const line = document.createElement("div");
  let colorClass = "text-balatro-green";
  if (type === "player") colorClass = "text-balatro-blue";
  if (type === "system") colorClass = "text-balatro-red";
  if (type === "warning") colorClass = "text-balatro-yellow";
  if (type === "info") colorClass = "text-balatro-green";

  line.className = `terminal-log opacity-0 mb-[2px] ${colorClass}`;
  line.innerText = `> ${msg}`;
  _termEl.insertBefore(line, _cursorEl);
  _termEl.scrollTop = _termEl.scrollHeight;
}

/* Card template & event delegation — avoids per-card listener allocation
   and innerHTML parsing on every render. Listeners are attached once to
   the container and delegate via event bubbling. */
let _cardTpl = null;
let _playCardFn = null;
let _delegationAttached = false;
let _lastHoveredCard = null;

const _RARITY_BORDER = {
  common: "border-[#3b3f6b]",
  rare: "border-balatro-purple",
  epic: "border-balatro-yellow",
};

function _ensureCardTemplate() {
  if (_cardTpl) return _cardTpl;
  _cardTpl = document.createElement("template");
  _cardTpl.innerHTML = `
    <div class="card min-w-[120px] sm:min-w-[140px] h-[155px] sm:h-[170px] p-2.5 cursor-pointer shrink-0 flex flex-col justify-between relative border-2"
         role="button" tabindex="0">
      <div class="flex justify-between items-center w-full">
        <span class="card-ram text-[0.6rem] bg-balatro-blue text-black font-pixel font-bold px-[4px] py-[1px] rounded"></span>
        <span class="card-sticker"></span>
      </div>
      <div class="card-code text-[0.82rem] sm:text-[0.92rem] text-white font-bold font-mono my-2 leading-[1.25] text-center"></div>
      <div class="card-desc text-[0.62rem] text-white/70 leading-[1.3] text-center"></div>
    </div>
  `;
  return _cardTpl;
}

function _attachHandDelegation(container) {
  if (_delegationAttached) return;
  _delegationAttached = true;

  container.addEventListener("click", (e) => {
    const cardEl = e.target.closest(".card");
    if (!cardEl || !_playCardFn) return;
    const idx = parseInt(cardEl.dataset.index, 10);
    if (!isNaN(idx)) _playCardFn(idx, cardEl);
  });

  container.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const cardEl = e.target.closest(".card");
    if (!cardEl || !_playCardFn) return;
    e.preventDefault();
    const idx = parseInt(cardEl.dataset.index, 10);
    if (!isNaN(idx)) _playCardFn(idx, cardEl);
  });

  container.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".card");
    if (card && card !== _lastHoveredCard) {
      _lastHoveredCard = card;
      audioEngine.playHover();
    }
  });

  container.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".card");
    if (!card || !card.contains(e.relatedTarget)) {
      _lastHoveredCard = null;
    }
  });
}

export function renderHand(playCardFn) {
  const container = document.getElementById("hand-container");
  if (!container) return;

  _playCardFn = playCardFn;
  _attachHandDelegation(container);

  container.replaceChildren();

  const tpl = _ensureCardTemplate();
  const fragment = document.createDocumentFragment();

  hand.forEach((card, index) => {
    const cardEl = tpl.content.firstElementChild.cloneNode(true);
    cardEl.classList.add(`type-${card.type}`, _RARITY_BORDER[card.rarity] || "border-[#3b3f6b]");
    cardEl.dataset.index = index;
    cardEl.setAttribute("aria-label", `${card.code} — ${card.desc}`);

    const sticker = cardEl.querySelector(".card-sticker");
    if (sticker) {
      sticker.classList.add(card.rarity || "common");
      sticker.textContent = card.rarity;
    }
    cardEl.querySelector(".card-ram").textContent = `${card.ram} RAM`;
    cardEl.querySelector(".card-code").textContent = card.code;
    cardEl.querySelector(".card-desc").textContent = card.desc;

    fragment.appendChild(cardEl);
  });

  container.appendChild(fragment);
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

    cardEl.className = `card type-${card.type} h-[145px] p-2.5 flex flex-col justify-between relative border-2 ${rarityBorder}`;
    cardEl.setAttribute("role", "listitem");
    cardEl.innerHTML = `
      <div class="flex justify-between items-center w-full">
        <span class="card-ram text-[0.55rem] bg-balatro-blue text-black font-pixel font-bold px-[3px] py-[1px] rounded">${card.ram} RAM</span>
        <span class="card-sticker ${stickerClass}">${card.rarity}</span>
      </div>
      <div class="card-code text-[0.72rem] text-white font-bold font-mono text-center">${card.code}</div>
      <div class="card-desc text-[0.58rem] text-white/60 text-center">${card.desc}</div>
    `;
    container.appendChild(cardEl);
  });
}

/* Cached DOM refs for updateUI() — avoids repeated getElementById. */
let _uiRefs = null;
function _getUIRefs() {
  if (_uiRefs) return _uiRefs;
  _uiRefs = {
    playerHp: document.getElementById("player-hp"),
    hpBarFill: document.getElementById("hpBarFill"),
    playerRam: document.getElementById("player-ram"),
    ramBarFill: document.getElementById("ramBarFill"),
    varX: document.getElementById("var-x"),
    playerBlock: document.getElementById("player-block"),
    ramDisplay: document.getElementById("ramDisplay"),
    enemyHp: document.getElementById("enemy-hp"),
    enemyHpFill: document.getElementById("enemyHpFill"),
  };
  return _uiRefs;
}

export function updateUI() {
  const r = _getUIRefs();
  if (!r.playerHp) return;

  r.playerHp.innerText = `${player.hp}/${player.maxHp}`;
  if (r.hpBarFill)
    r.hpBarFill.style.transform = `scaleX(${Math.min(1, Math.max(0, player.hp / player.maxHp))})`;

  r.playerRam.innerText = `${player.ram}/${player.maxRam}`;
  r.ramBarFill.style.transform =
    `scaleX(${Math.min(1, Math.max(0, player.ram / player.maxRam))})`;
  r.varX.innerText = player.varX;
  r.playerBlock.innerText = player.block;
  r.ramDisplay.innerText = `RAM: ${player.ram}/${player.maxRam}`;

  r.enemyHp.innerText = `${enemy.hp}/${enemy.maxHp}`;
  r.enemyHpFill.style.transform =
    `scaleX(${Math.min(1, Math.max(0, enemy.hp / enemy.maxHp))})`;
}
