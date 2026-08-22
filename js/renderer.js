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

/* ── Canvas 2D Side-Scrolling Renderer ───────────────────────────── */
import { world, playerSprite, enemySprite, projectiles, particles } from "./state.js";

let _canvas = null;
let _ctx = null;
const _images = {};

// Sprite configurations
const SPRITES = {
  bgNight: [1, 2, 3, 4, 5].map(n => `assets/sprite/2 Background/Night/${n}.png`),
  groundTile: "assets/sprite/1 Tiles/Tile_02.png",
  groundSubTile: "assets/sprite/1 Tiles/Tile_05.png",
  player: {
    idle: { src: "assets/sprite/1 Characters/3 Cyborg/Idle1.png", frames: 4, width: 48, height: 48 },
    run: { src: "assets/sprite/1 Characters/3 Cyborg/Run1.png", frames: 6, width: 48, height: 48 },
    walk: { src: "assets/sprite/1 Characters/3 Cyborg/Walk1.png", frames: 6, width: 48, height: 48 },
    hurt: { src: "assets/sprite/1 Characters/3 Cyborg/Idle2.png", frames: 4, width: 48, height: 48 },
  },
  enemy1: { // FIREWALL DAEMON
    idle: { src: "assets/sprite/1 Enemies/1/Idle.png", frames: 4, width: 96, height: 96 },
    run: { src: "assets/sprite/1 Enemies/1/Run.png", frames: 6, width: 96, height: 96 },
    attack: { src: "assets/sprite/1 Enemies/1/Attack.png", frames: 6, width: 96, height: 96 },
    hurt: { src: "assets/sprite/1 Enemies/1/Hurt.png", frames: 2, width: 96, height: 96 },
    death: { src: "assets/sprite/1 Enemies/1/Death.png", frames: 6, width: 96, height: 96 },
  },
  enemy2: { // INTRUSION WRAITH
    idle: { src: "assets/sprite/1 Enemies/2/Idle.png", frames: 6, width: 96, height: 96 },
    run: { src: "assets/sprite/1 Enemies/2/Drive.png", frames: 6, width: 96, height: 96 },
    attack: { src: "assets/sprite/1 Enemies/2/Drive.png", frames: 6, width: 96, height: 96 },
    hurt: { src: "assets/sprite/1 Enemies/2/Hurt.png", frames: 2, width: 96, height: 96 },
    death: { src: "assets/sprite/1 Enemies/2/Death.png", frames: 4, width: 96, height: 96 },
  },
  enemy3: { // LOGIC BOMBER / MAINFRAME CORE
    idle: { src: "assets/sprite/1 Enemies/3/Idle.png", frames: 4, width: 96, height: 96 },
    run: { src: "assets/sprite/1 Enemies/3/Walk.png", frames: 6, width: 96, height: 96 },
    attack: { src: "assets/sprite/1 Enemies/3/Attack.png", frames: 6, width: 96, height: 96 },
    hurt: { src: "assets/sprite/1 Enemies/3/Hurt.png", frames: 2, width: 96, height: 96 },
    death: { src: "assets/sprite/1 Enemies/3/Death.png", frames: 6, width: 96, height: 96 },
  },
  bullet: "assets/sprite/5 Bullets/1.png",
  muzzleFlash: "assets/sprite/4 Shoot_effects/6_1.png",
};

function _loadImage(src) {
  if (_images[src]) return _images[src];
  const img = new Image();
  img.src = src;
  _images[src] = img;
  return img;
}

export function initCanvasRenderer() {
  _canvas = document.getElementById("game-canvas");
  if (!_canvas) return;
  _ctx = _canvas.getContext("2d");
  
  // Preload primary sprites
  SPRITES.bgNight.forEach(_loadImage);
  _loadImage(SPRITES.groundTile);
  _loadImage(SPRITES.groundSubTile);
  _loadImage(SPRITES.bullet);
  _loadImage(SPRITES.muzzleFlash);
  Object.values(SPRITES.player).forEach(s => _loadImage(s.src));
  Object.values(SPRITES.enemy1).forEach(s => _loadImage(s.src));
  Object.values(SPRITES.enemy2).forEach(s => _loadImage(s.src));
  Object.values(SPRITES.enemy3).forEach(s => _loadImage(s.src));
}

export function drawScene(dt = 0.016) {
  if (!_canvas) {
    initCanvasRenderer();
    if (!_canvas) return;
  }
  const w = _canvas.width;
  const h = _canvas.height;

  _ctx.clearRect(0, 0, w, h);
  _ctx.imageSmoothingEnabled = false; // Pixel art look

  // 1. Draw Parallax Background
  const speeds = [0.1, 0.25, 0.4, 0.65, 1.0];
  SPRITES.bgNight.forEach((src, idx) => {
    const img = _loadImage(src);
    if (img.complete && img.naturalWidth > 0) {
      const speed = speeds[idx] || 0.5;
      const offsetX = (world.scrollX * speed) % w;
      _ctx.drawImage(img, -offsetX, 0, w, h);
      _ctx.drawImage(img, w - offsetX, 0, w, h);
    } else {
      _ctx.fillStyle = idx === 0 ? "#0a0c16" : "rgba(10, 20, 40, 0.15)";
      _ctx.fillRect(0, 0, w, h);
    }
  });

  // 2. Draw Ground Tiles
  const groundTileImg = _loadImage(SPRITES.groundTile);
  const tileSize = 32;
  const tileScale = 1.25; // 40px tiles
  const scaledTile = tileSize * tileScale;
  const groundY = world.groundY;
  const tileOffsetX = (world.scrollX * 1.0) % scaledTile;

  for (let x = -scaledTile; x < w + scaledTile; x += scaledTile) {
    if (groundTileImg.complete && groundTileImg.naturalWidth > 0) {
      _ctx.drawImage(groundTileImg, x - tileOffsetX, groundY, scaledTile, scaledTile);
    } else {
      _ctx.fillStyle = "#1b3c33";
      _ctx.fillRect(x - tileOffsetX, groundY, scaledTile, scaledTile);
    }
  }
  // Fill ground body
  _ctx.fillStyle = "#0c1d18";
  _ctx.fillRect(0, groundY + scaledTile, w, h - (groundY + scaledTile));

  // Grid / scanline aesthetic on ground edge
  _ctx.strokeStyle = "rgba(0, 255, 200, 0.25)";
  _ctx.lineWidth = 2;
  _ctx.beginPath();
  _ctx.moveTo(0, groundY);
  _ctx.lineTo(w, groundY);
  _ctx.stroke();

  // 3. Update & Draw Player Robot Sprite
  playerSprite.frameTimer += dt;
  const pAnimConfig = SPRITES.player[playerSprite.animState] || SPRITES.player.idle;
  if (playerSprite.frameTimer >= 0.12) {
    playerSprite.frameTimer = 0;
    playerSprite.frame = (playerSprite.frame + 1) % pAnimConfig.frames;
  }

  const pImg = _loadImage(pAnimConfig.src);
  const pDrawW = 90;
  const pDrawH = 90;
  const pDrawX = playerSprite.x;
  const pDrawY = groundY - pDrawH + 10;

  if (pImg.complete && pImg.naturalWidth > 0) {
    const frameX = (playerSprite.frame % pAnimConfig.frames) * pAnimConfig.width;
    _ctx.drawImage(pImg, frameX, 0, pAnimConfig.width, pAnimConfig.height, pDrawX, pDrawY, pDrawW, pDrawH);
  } else {
    _ctx.fillStyle = "#009ddc";
    _ctx.fillRect(pDrawX, pDrawY, pDrawW, pDrawH);
  }

  // Draw Shield Glow Effect
  if (playerSprite.shieldTimer > 0) {
    playerSprite.shieldTimer -= dt;
    _ctx.save();
    _ctx.strokeStyle = "rgba(137, 87, 229, 0.85)";
    _ctx.lineWidth = 4;
    _ctx.shadowColor = "#8957e5";
    _ctx.shadowBlur = 12;
    _ctx.beginPath();
    _ctx.ellipse(pDrawX + pDrawW / 2, pDrawY + pDrawH / 2, pDrawW / 1.8, pDrawH / 1.8, 0, 0, Math.PI * 2);
    _ctx.stroke();
    _ctx.restore();
  }

  // Muzzle Flash
  if (playerSprite.muzzleFlashTimer > 0) {
    playerSprite.muzzleFlashTimer -= dt;
    const mImg = _loadImage(SPRITES.muzzleFlash);
    const muzzleX = pDrawX + pDrawW - 10;
    const muzzleY = pDrawY + pDrawH / 2 - 12;
    if (mImg.complete && mImg.naturalWidth > 0) {
      _ctx.drawImage(mImg, muzzleX, muzzleY, 24, 24);
    }
  }

  // 4. Update & Draw Enemy Sprite (Flipped horizontally to face player)
  if (enemy.hp > 0 || enemySprite.opacity > 0) {
    enemySprite.frameTimer += dt;
    const eSpriteSet = (enemy.name === "INTRUSION WRAITH" ? SPRITES.enemy2 :
                        enemy.name === "LOGIC BOMBER" ? SPRITES.enemy3 : SPRITES.enemy1);
    const eAnimConfig = eSpriteSet[enemySprite.animState] || eSpriteSet.idle;
    if (enemySprite.frameTimer >= 0.12) {
      enemySprite.frameTimer = 0;
      enemySprite.frame = (enemySprite.frame + 1) % eAnimConfig.frames;
    }

    const eImg = _loadImage(eAnimConfig.src);
    const eDrawW = 120;
    const eDrawH = 120;
    const eDrawX = enemySprite.x;
    const eDrawY = groundY - eDrawH + 10;

    _ctx.save();
    if (enemySprite.opacity < 1) {
      _ctx.globalAlpha = Math.max(0, enemySprite.opacity);
    }

    // Mirror enemy horizontally to face left (toward player)
    _ctx.translate(eDrawX + eDrawW / 2, 0);
    _ctx.scale(-1, 1);
    const localX = -eDrawW / 2;

    if (eImg.complete && eImg.naturalWidth > 0) {
      const frameX = (enemySprite.frame % eAnimConfig.frames) * eAnimConfig.width;
      _ctx.drawImage(eImg, frameX, 0, eAnimConfig.width, eAnimConfig.height, localX, eDrawY, eDrawW, eDrawH);
    } else {
      _ctx.fillStyle = "#fe5f55";
      _ctx.fillRect(localX, eDrawY, eDrawW, eDrawH);
    }
    _ctx.restore();
  }


  // 5. Draw Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    const bImg = _loadImage(SPRITES.bullet);
    if (bImg.complete && bImg.naturalWidth > 0) {
      _ctx.drawImage(bImg, proj.x, proj.y, 20, 10);
    } else {
      _ctx.fillStyle = "#f5c542";
      _ctx.fillRect(proj.x, proj.y, 14, 6);
    }

    // Glow trail
    _ctx.fillStyle = "rgba(245, 197, 66, 0.4)";
    _ctx.fillRect(proj.x - 12, proj.y + 2, 12, 4);

    // Collision check with target
    if (proj.vx > 0 && proj.x >= proj.targetX) {
      if (proj.onImpact) proj.onImpact();
      projectiles.splice(i, 1);
    } else if (proj.vx < 0 && proj.x <= proj.targetX) {
      if (proj.onImpact) proj.onImpact();
      projectiles.splice(i, 1);
    }
  }

  // 6. Draw Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    const alpha = p.life / p.maxLife;
    _ctx.fillStyle = p.color.replace(")", `, ${alpha})`).replace("rgb", "rgba");
    _ctx.beginPath();
    _ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    _ctx.fill();
  }
}

/* Cached DOM refs for updateUI() */
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
    playerBlockVal: document.getElementById("player-block-val"),
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
  if (r.ramBarFill)
    r.ramBarFill.style.transform = `scaleX(${Math.min(1, Math.max(0, player.ram / player.maxRam))})`;
  
  if (r.varX) r.varX.innerText = player.varX;
  if (r.playerBlock) r.playerBlock.innerText = player.block;
  if (r.playerBlockVal) r.playerBlockVal.innerText = player.block;
  if (r.ramDisplay) r.ramDisplay.innerText = `RAM: ${player.ram}/${player.maxRam}`;

  if (r.enemyHp) r.enemyHp.innerText = `${enemy.hp}/${enemy.maxHp}`;
  if (r.enemyHpFill)
    r.enemyHpFill.style.transform = `scaleX(${Math.min(1, Math.max(0, enemy.hp / enemy.maxHp))})`;
}

