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

function _ensureCardTemplate() {
  if (_cardTpl) return _cardTpl;
  _cardTpl = document.createElement("template");
  _cardTpl.innerHTML = `
    <div class="card min-w-[145px] sm:min-w-[160px] w-[150px] sm:w-[165px] h-[185px] sm:h-[200px] p-2 sm:p-2.5 cursor-pointer shrink-0 flex flex-col justify-between relative border-0"
         role="button" tabindex="0">
      <span class="card-type-bar" aria-hidden="true"></span>
      <div class="flex justify-start items-center w-full z-10 px-0.5 pt-0.5">
        <span class="card-ram text-[0.52rem] sm:text-[0.56rem] bg-black/85 text-balatro-blue font-pixel font-bold px-1 py-0.5 rounded border border-balatro-blue/40 shadow-sm"></span>
      </div>
      <div class="card-body-frame my-auto flex flex-col items-center justify-center px-1 z-10">
        <div class="card-code text-[0.8rem] sm:text-[0.9rem] text-white font-bold font-mono text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] leading-tight"></div>
        <div class="card-desc text-[0.55rem] sm:text-[0.58rem] text-white/85 leading-tight text-center mt-1.5 font-sans"></div>
      </div>
      <div class="card-footer-type text-[0.48rem] font-pixel tracking-wider text-center uppercase text-white/60 z-10 pb-0.5"></div>
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
    cardEl.classList.add(`type-${card.type}`);
    if (player.ram < card.ram) {
      cardEl.classList.add("unusable");
    }
    cardEl.dataset.index = index;
    cardEl.setAttribute("aria-label", `${card.code} — ${card.desc}`);

    cardEl.querySelector(".card-ram").textContent = `${card.ram} RAM`;
    cardEl.querySelector(".card-code").textContent = card.code;
    cardEl.querySelector(".card-desc").textContent = card.desc;

    const footerType = cardEl.querySelector(".card-footer-type");
    if (footerType) {
      footerType.textContent = card.type;
    }

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

    cardEl.className = `card type-${card.type} h-[175px] p-2 flex flex-col justify-between relative border-0`;
    cardEl.setAttribute("role", "listitem");
    cardEl.innerHTML = `
      <div class="flex justify-start items-center w-full z-10 px-0.5 pt-0.5">
        <span class="card-ram text-[0.52rem] bg-black/85 text-balatro-blue font-pixel font-bold px-1 py-0.5 rounded border border-balatro-blue/40 shadow-sm">${card.ram} RAM</span>
      </div>
      <div class="card-body-frame my-auto flex flex-col items-center justify-center px-1 z-10">
        <div class="card-code text-[0.76rem] text-white font-bold font-mono text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] leading-tight">${card.code}</div>
        <div class="card-desc text-[0.55rem] text-white/85 leading-tight text-center mt-1 font-sans">${card.desc}</div>
      </div>
      <div class="card-footer-type text-[0.48rem] font-pixel tracking-wider text-center uppercase text-white/60 z-10 pb-0.5">${card.type}</div>
    `;
    container.appendChild(cardEl);
  });
}



/* ── Canvas 2D Side-Scrolling Renderer ───────────────────────────── */
import { world, playerSprite, enemySprite, projectiles, particles, screenShake } from "./state.js";

let _canvas = null;
let _ctx = null;
let _viewScale = 1;
const _images = {};
const _bgImgs = [];
let _groundTileImg = null;
let _groundSubTileImg = null;
let _bulletImg = null;
let _muzzleFlashImg = null;

const REDUCED_MOTION =
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// Sprite configurations
const SPRITES = {
  bgNight: [1, 2, 3, 4, 5].map(n => `assets/sprite/lib/2 Background/Night/${n}.png`),
  groundTile: "assets/sprite/lib/1 Tiles/Tile_02.png",
  groundSubTile: "assets/sprite/lib/1 Tiles/Tile_05.png",
  player: {
    idle: { src: "assets/sprite/player/Idle1.png", frames: 4, width: 48, height: 48 },
    run: { src: "assets/sprite/player/Run1.png", frames: 6, width: 48, height: 48 },
    walk: { src: "assets/sprite/player/Walk1.png", frames: 6, width: 48, height: 48 },
    hurt: { src: "assets/sprite/player/Idle2.png", frames: 4, width: 48, height: 48 },
  },
  enemy1: { // FIREWALL DAEMON
    idle: { src: "assets/sprite/enemy/0/Idle.png", frames: 4, width: 96, height: 96 },
    run: { src: "assets/sprite/enemy/0/Run.png", frames: 6, width: 96, height: 96 },
    attack: { src: "assets/sprite/enemy/0/Attack.png", frames: 6, width: 96, height: 96 },
    hurt: { src: "assets/sprite/enemy/0/Death.png", frames: 2, width: 96, height: 96 },
    death: { src: "assets/sprite/enemy/0/Death.png", frames: 6, width: 96, height: 96 },
  },
  enemy2: { // INTRUSION WRAITH
    idle: { src: "assets/sprite/enemy/1/Idle.png", frames: 6, width: 96, height: 96 },
    run: { src: "assets/sprite/enemy/1/Drive.png", frames: 6, width: 96, height: 96 },
    attack: { src: "assets/sprite/enemy/1/Drive.png", frames: 6, width: 96, height: 96 },
    hurt: { src: "assets/sprite/enemy/1/Hurt.png", frames: 2, width: 96, height: 96 },
    death: { src: "assets/sprite/enemy/1/Death.png", frames: 4, width: 96, height: 96 },
  },
  enemy3: { // LOGIC BOMBER / MAINFRAME CORE
    idle: { src: "assets/sprite/enemy/2/Idle.png", frames: 4, width: 96, height: 96 },
    run: { src: "assets/sprite/enemy/2/Walk.png", frames: 6, width: 96, height: 96 },
    attack: { src: "assets/sprite/enemy/2/Attack.png", frames: 6, width: 96, height: 96 },
    hurt: { src: "assets/sprite/enemy/2/Hurt.png", frames: 2, width: 96, height: 96 },
    death: { src: "assets/sprite/enemy/2/Death.png", frames: 6, width: 96, height: 96 },
  },
  bullet: "assets/sprite/attack/5.png",
  muzzleFlash: "assets/sprite/attack/6_1.png",
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
  _ctx.imageSmoothingEnabled = false;

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Preload and cache primary sprites
  SPRITES.bgNight.forEach(src => _bgImgs.push(_loadImage(src)));
  _groundTileImg = _loadImage(SPRITES.groundTile);
  _groundSubTileImg = _loadImage(SPRITES.groundSubTile);
  _bulletImg = _loadImage(SPRITES.bullet);
  _muzzleFlashImg = _loadImage(SPRITES.muzzleFlash);
  Object.values(SPRITES.player).forEach(s => _loadImage(s.src));
  Object.values(SPRITES.enemy1).forEach(s => _loadImage(s.src));
  Object.values(SPRITES.enemy2).forEach(s => _loadImage(s.src));
  Object.values(SPRITES.enemy3).forEach(s => _loadImage(s.src));
}

/* Resize canvas bitmap to its CSS box and derive the uniform view scale.
   The logical world is always 820x260; height-fit scaling keeps sprite
   proportions identical from desktop down to phones. */
export function resizeCanvas() {
  if (!_canvas) return;
  const cw = _canvas.clientWidth || 820;
  const ch = _canvas.clientHeight || 260;
  _canvas.width = cw;
  _canvas.height = ch;
  _viewScale = ch / 260;
  if (_ctx) _ctx.imageSmoothingEnabled = false;
}

export function logicalWorldWidth() {
  return Math.round((_canvas ? _canvas.width : 820) / _viewScale);
}

export function drawScene(dt = 0.016) {
  if (!_canvas) {
    initCanvasRenderer();
    if (!_canvas) return;
  }
  // Canvas may have been display:none during init (clientWidth 0) or flipped
  // across a sm: breakpoint — resync bitmap to CSS box only when they differ.
  if (_canvas.clientWidth > 0 && (_canvas.width !== _canvas.clientWidth || _canvas.height !== _canvas.clientHeight)) {
    resizeCanvas();
  }
  const w = Math.round(_canvas.width / _viewScale);
  const h = 260;

  _ctx.setTransform(_viewScale, 0, 0, _viewScale, 0, 0);
  _ctx.clearRect(0, 0, w, h);

  // Screen shake — decaying sinusoidal offset (skipped under reduced motion)
  if (screenShake.t > 0 && !REDUCED_MOTION) {
    screenShake.t = Math.max(0, screenShake.t - dt);
    const k = (screenShake.t / screenShake.duration) * screenShake.intensity;
    _ctx.translate(Math.sin(screenShake.t * 93) * k, Math.cos(screenShake.t * 71) * k);
  }

  // 1. Draw Parallax Background (camera-driven)
  const speeds = [0.1, 0.25, 0.4, 0.65, 1.0];
  for (let idx = 0; idx < _bgImgs.length; idx++) {
    const img = _bgImgs[idx];
    if (img.complete && img.naturalWidth > 0) {
      const speed = speeds[idx] || 0.5;
      const offsetX = (world.camX * speed) % w;
      _ctx.drawImage(img, -offsetX, 0, w, h);
      _ctx.drawImage(img, w - offsetX, 0, w, h);
    } else {
      _ctx.fillStyle = idx === 0 ? "#161b33" : "rgba(20, 32, 60, 0.15)";
      _ctx.fillRect(0, 0, w, h);
    }
  }

  // 2. Draw Ground Tiles
  const groundTileImg = _groundTileImg;
  const tileSize = 32;
  const tileScale = 1.25; // 40px tiles
  const scaledTile = tileSize * tileScale;
  const groundY = world.groundY;
  const tileOffsetX = (world.camX * 1.0) % scaledTile;

  for (let x = -scaledTile; x < w + scaledTile; x += scaledTile) {
    if (groundTileImg.complete && groundTileImg.naturalWidth > 0) {
      _ctx.drawImage(groundTileImg, x - tileOffsetX, groundY, scaledTile, scaledTile);
    } else {
      _ctx.fillStyle = "#2a4f43";
      _ctx.fillRect(x - tileOffsetX, groundY, scaledTile, scaledTile);
    }
  }
  // Fill ground body
  _ctx.fillStyle = "#17302a";
  _ctx.fillRect(0, groundY + scaledTile, w, h - (groundY + scaledTile));

  // Grid / scanline aesthetic on ground edge
  _ctx.strokeStyle = "rgba(0, 255, 200, 0.25)";
  _ctx.lineWidth = 2;
  _ctx.beginPath();
  _ctx.moveTo(0, groundY);
  _ctx.lineTo(w, groundY);
  _ctx.stroke();

  // 3. Update & Draw Player Robot Sprite
  const qaHold = typeof window !== "undefined" && window.__qaHold === true;
  const pAnimConfig = SPRITES.player[playerSprite.animState] || SPRITES.player.idle;
  if (!qaHold) {
    playerSprite.frameTimer += dt;
    if (playerSprite.frameTimer >= 0.12) {
      playerSprite.frameTimer = 0;
      playerSprite.frame = (playerSprite.frame + 1) % pAnimConfig.frames;
    }
  }

  const pImg = _loadImage(pAnimConfig.src);
  const pDrawW = 90;
  const pDrawH = 90;
  const pDrawX = playerSprite.x - world.camX;
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
    const mImg = _muzzleFlashImg;
    const muzzleX = pDrawX + pDrawW - 10;
    const muzzleY = pDrawY + pDrawH / 2 - 12;
    if (mImg.complete && mImg.naturalWidth > 0) {
      _ctx.drawImage(mImg, muzzleX, muzzleY, 24, 24);
    }
  }

  // 4. Update & Draw Enemy Sprite (Flipped horizontally to face player)
  if (enemy.hp > 0 || enemySprite.opacity > 0) {
    const eSpriteSet = (enemy.name === "INTRUSION WRAITH" ? SPRITES.enemy2 :
      enemy.name === "LOGIC BOMBER" ? SPRITES.enemy3 : SPRITES.enemy1);
    const eAnimConfig = eSpriteSet[enemySprite.animState] || eSpriteSet.idle;
    if (!qaHold && world.phase !== "RUNNING") {
      enemySprite.frameTimer += dt;
      if (enemySprite.frameTimer >= 0.12) {
        enemySprite.frameTimer = 0;
        const nextF = enemySprite.frame + 1;
        // Corpse holds its final death frame instead of looping
        enemySprite.frame = enemySprite.dead
          ? Math.min(nextF, eAnimConfig.frames - 1)
          : nextF % eAnimConfig.frames;
      }
    }

    const eImg = _loadImage(eAnimConfig.src);
    const eDrawW = 160;
    const eDrawH = 160;
    // The enemy is anchored at a fixed world position — standing still
    // while the player approaches.  Clamp only during BATTLE so the
    // enemy can start off-screen and enter naturally during RUNNING.
    let eDrawX = enemySprite.x - world.camX;
    if (world.phase === "BATTLE") {
      const minX = 80;
      const maxX = w - eDrawW - 80;
      eDrawX = Math.max(minX, Math.min(eDrawX, maxX));
    }
    const eDrawY = groundY - eDrawH + 10;

    // Attack telegraph: pulsing red aura + windup lean while the enemy
    // intends to attack and hasn't started its attack animation yet
    if (
      world.phase === "BATTLE" &&
      enemy.intent === "attack" &&
      enemy.hp > 0 &&
      enemySprite.animState !== "attack"
    ) {
      if (REDUCED_MOTION) {
        // Steady outline, no pulse or movement
        _ctx.save();
        _ctx.globalAlpha = 0.4;
        _ctx.strokeStyle = "#ff3355";
        _ctx.lineWidth = 4;
        _ctx.beginPath();
        _ctx.ellipse(eDrawX + eDrawW / 2, groundY - eDrawH / 2, eDrawW / 1.7, eDrawH / 1.7, 0, 0, Math.PI * 2);
        _ctx.stroke();
        _ctx.restore();
      } else {
        const pulse = (Math.sin(performance.now() / 1000 * 6) + 1) / 2; // 0..1
        eDrawX -= 3 + pulse * 5; // windup lean away from player
        _ctx.save();
        _ctx.globalAlpha = 0.25 + pulse * 0.3;
        _ctx.strokeStyle = "#ff3355";
        _ctx.lineWidth = 4;
        _ctx.shadowColor = "#ff3355";
        _ctx.shadowBlur = 18;
        _ctx.beginPath();
        _ctx.ellipse(eDrawX + eDrawW / 2, groundY - eDrawH / 2, eDrawW / 1.7, eDrawH / 1.7, 0, 0, Math.PI * 2);
        _ctx.stroke();
        _ctx.restore();
      }
    }

    _ctx.save();
    if (enemySprite.opacity < 1) {
      _ctx.globalAlpha = Math.max(0, enemySprite.opacity);
    }

    if (enemySprite.dead) {
      // Fallen corpse — rotated flat near the ground line, dimmed, so the
      // player can run past it during the victory walk
      _ctx.globalAlpha *= 0.55;
      _ctx.translate(eDrawX + eDrawW / 2, groundY + 20);
      _ctx.rotate(-Math.PI / 2);
      if (eImg.complete && eImg.naturalWidth > 0) {
        const frameX = (enemySprite.frame % eAnimConfig.frames) * eAnimConfig.width;
        _ctx.drawImage(eImg, frameX, 0, eAnimConfig.width, eAnimConfig.height, -35, -75, 70, 150);
      } else {
        _ctx.fillStyle = "#fe5f55";
        _ctx.fillRect(-35, -75, 70, 150);
      }
    } else {
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
    }
    _ctx.restore();
  }


  // 5. Draw Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    const bImg = _bulletImg;
    if (bImg.complete && bImg.naturalWidth > 0) {
      _ctx.drawImage(bImg, proj.x - world.camX, proj.y, 20, 10);
    } else {
      _ctx.fillStyle = "#f5c542";
      _ctx.fillRect(proj.x - world.camX, proj.y, 14, 6);
    }

    // Glow trail
    _ctx.fillStyle = "rgba(245, 197, 66, 0.4)";
    _ctx.fillRect(proj.x - 12 - world.camX, proj.y + 2, 12, 4);

    // Collision check with target
    if (proj.vx > 0 && proj.x >= proj.targetX) {
      if (proj.onImpact) proj.onImpact();
      projectiles[i] = projectiles[projectiles.length - 1];
      projectiles.pop();
    } else if (proj.vx < 0 && proj.x <= proj.targetX) {
      if (proj.onImpact) proj.onImpact();
      projectiles[i] = projectiles[projectiles.length - 1];
      projectiles.pop();
    }
  }

  // 6. Draw Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    const alpha = p.life / p.maxLife;
    _ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
    _ctx.beginPath();
    _ctx.arc(p.x - world.camX, p.y, p.radius, 0, Math.PI * 2);
    _ctx.fill();
  }

  // QA determinism: once battle phase is reached on a canonical sprite frame,
  // latch the hold flag so subsequent ticks render an identical scene
  if (
    !qaHold &&
    typeof window !== "undefined" &&
    window.__qaArm === true &&
    world.phase === "BATTLE" &&
    playerSprite.frame === 0 &&
    enemySprite.frame === 0
  ) {
    window.__qaHold = true;
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

