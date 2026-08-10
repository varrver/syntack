/**
 * SYNTACK — Main Cyberpunk Deckbuilder Game Engine & Screen Manager
 * Balatro-inspired visual & screen navigation architecture.
 */

import { audioEngine } from './audio.js';
import {
  animateScreenTransition,
  animateModalOpen,
  animateModalClose,
  animateHandStagger,
  animateCardPlay,
  animateInsufficientRam,
  animateEnemyDamage,
  animateEnemyAttack,
  animateEnemyTelegraph,
  animateFloatDamage,
  animateAttackBolt,
  animateHitFlash,
  animateBurst,
  animateHandRecoil
} from './motion.js';

/* ── Vector icon set (inline SVG, consistent 2px stroke) ── */
function svgIcon(paths, sizeClass = "icon") {
  return `<svg class="${sizeClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const ICONS = {
  sword: svgIcon(
    `<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" x2="19" y1="19" y2="13"></line><line x1="16" x2="20" y1="16" y2="20"></line><line x1="19" x2="21" y1="21" y2="19"></line>`,
    "icon-sm"
  ),
  shield: svgIcon(
    `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>`,
    "icon-sm"
  ),
  trend: svgIcon(
    `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline>`,
    "icon-sm"
  ),
  speakerOn: svgIcon(
    `<path d="M11 5 6 9H2v6h4l5 4V5Z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>`
  ),
  speakerOff: svgIcon(
    `<path d="M11 5 6 9H2v6h4l5 4V5Z"></path><line x1="22" x2="16" y1="9" y2="15"></line><line x1="16" x2="22" y1="9" y2="15"></line>`
  ),
};

let player = { hp: 50, maxHp: 50, ram: 3, maxRam: 3, block: 0, varX: 0, loopMult: 1 };
let enemy = { hp: 60, maxHp: 60, attackDmg: 8, intent: "attack", name: "FIREWALL DAEMON" };

/* Multi-node run: the player hacks through BOSS_NODE-1 network nodes plus a
   final MAINFRAME boss. Node 1 keeps the original fight (60 HP / 8 ATK) so the
   QA harness's historical expectations (E3 HP values, golden arena baseline)
   stay valid; later nodes escalate. */
const ENEMY_ROSTER = [
  { name: "FIREWALL DAEMON", hp: 60, attackDmg: 8 },   // node 1
  { name: "INTRUSION WRAITH", hp: 75, attackDmg: 10 }, // node 2
  { name: "LOGIC BOMBER", hp: 90, attackDmg: 12 },     // node 3
  { name: "MAINFRAME CORE", hp: 120, attackDmg: 14 },  // node 4 — boss
];
const BOSS_NODE = ENEMY_ROSTER.length;

let run = {
  node: 1,
  bestNode: (() => {
    try {
      return parseInt(localStorage.getItem("syntack_best_node") || "0", 10) || 0;
    } catch {
      return 0;
    }
  })(),
};

const CARD_TYPES = [
  {
    id: 1, ram: 1, code: "let x = 8;", desc: "Set Variable x = 8", rarity: "common", type: "variable",
    action: () => {
      player.varX = 8;
      log("Variable 'x' set to 8.", "player");
      animateFloatDamage("x = 8", "buff", "35%", "60%");
    }
  },
  {
    id: 2, ram: 1, code: "ATTACK(x)", desc: "Deal dmg = x (Default: 4)", rarity: "common", type: "attack",
    action: () => {
      let base = player.varX > 0 ? player.varX : 4;
      let total = base * player.loopMult;
      dealDamageToEnemy(total);
      log(`EXECUTE ATTACK(${total})!`, "player");
      player.loopMult = 1;
    }
  },
  {
    id: 3, ram: 1, code: "if (x > 5)", desc: "If x > 5: +10 Block, +4 ATK", rarity: "rare", type: "variable",
    action: () => {
      if (player.varX > 5) {
        player.block += 10;
        player.varX += 4;
        log("IF (x > 5) → TRUE! Block +10, x +4", "player");
        animateFloatDamage("+10 Block", "block", "30%", "55%");
        animateFloatDamage("x +4", "buff", "55%", "55%");
      } else {
        log("IF (x > 5) → FALSE. No effect.", "warning");
      }
    }
  },
  {
    id: 4, ram: 2, code: "for (2x Loop)", desc: "Double next attack damage!", rarity: "epic", type: "loop",
    action: () => {
      player.loopMult *= 2;
      log("FOR LOOP ACTIVE! Next attack 2x dmg!", "player");
      animateFloatDamage("2x DMG!", "buff", "45%", "50%");
    }
  },
  {
    id: 5, ram: 1, code: "DEFENSE(8)", desc: "Gain +8 Block", rarity: "common", type: "defense",
    action: () => {
      player.block += 8;
      log("DEFENSE(8) → Block +8", "player");
      animateFloatDamage("+8 Block", "block", "40%", "60%");
    }
  },
  {
    id: 6, ram: 1, code: "x *= 2", desc: "Double Variable x", rarity: "rare", type: "variable",
    action: () => {
      player.varX *= 2;
      log(`Variable x doubled → x = ${player.varX}`, "player");
      animateFloatDamage("x ×2", "buff", "35%", "55%");
    }
  },
  {
    id: 7, ram: 2, code: "OVERCLOCK()", desc: "Gain +2 RAM (max 5)", rarity: "epic", type: "defense",
    action: () => {
      let gained = Math.min(2, 5 - player.maxRam);
      if (gained > 0) {
        player.maxRam += gained;
        player.ram = player.maxRam;
        log(`OVERCLOCK! Max RAM ↑ ${player.maxRam}`, "player");
        animateFloatDamage("RAM +2", "heal", "40%", "50%");
      } else {
        log("OVERCLOCK: RAM already at max.", "warning");
      }
    }
  },
  {
    id: 8, ram: 1, code: "PURGE()", desc: "Deal dmg = Block (max 12)", rarity: "rare", type: "attack",
    action: () => {
      let dmg = Math.min(12, player.block);
      if (dmg > 0) {
        dealDamageToEnemy(dmg);
        log(`PURGE! Converted block → ${dmg} dmg`, "player");
      } else {
        log("PURGE: no block to convert.", "warning");
      }
    }
  },
  {
    id: 9, ram: 1, code: "REBOOT()", desc: "Heal +6 HP", rarity: "common", type: "defense",
    action: () => {
      const healed = Math.min(player.maxHp - player.hp, 6);
      if (healed > 0) {
        player.hp += healed;
        log(`REBOOT! HP +${healed}`, "player");
        animateFloatDamage(`+${healed} HP`, "heal", "40%", "55%");
      } else {
        log("REBOOT: HP already full.", "warning");
      }
    }
  },
  {
    id: 10, ram: 2, code: "PARALLEL()", desc: "Next attack 3x dmg", rarity: "epic", type: "loop",
    action: () => {
      player.loopMult *= 3;
      log("PARALLEL THREAD! Next attack 3x dmg!", "player");
      animateFloatDamage("3x DMG!", "buff", "45%", "50%");
    }
  },
];

let hand = [];
let isAnimating = false;
let gameOver = false;
// Where the last played card sat on screen — the launch point for the attack
// bolt in dealDamageToEnemy (captured before the card is spliced out).
let lastPlayRect = null;


function resetTerminal() {
  const term = document.getElementById("terminal");
  if (!term) return;
  term.innerHTML = '';
  const cursor = document.createElement("span");
  cursor.className = "terminal-cursor";
  cursor.setAttribute("aria-hidden", "true");
  term.appendChild(cursor);
}

/* Load the current run.node's enemy, reset per-fight state, and reflect the
   roster in the DOM (name, node indicator, best-run line, terminal). Records
   the deepest node reached so the home screen can show progress. */
function loadEnemy() {
  const def = ENEMY_ROSTER[run.node - 1] || ENEMY_ROSTER[0];
  enemy = { hp: def.hp, maxHp: def.hp, attackDmg: def.attackDmg, intent: "attack", name: def.name };
  player.block = 0;
  player.varX = 0;
  player.loopMult = 1;
  player.ram = player.maxRam;

  run.bestNode = Math.max(run.bestNode, run.node);
  try {
    localStorage.setItem("syntack_best_node", String(run.bestNode));
  } catch {}

  const nameEl = document.getElementById("enemy-name");
  if (nameEl) nameEl.textContent = `▸ ${def.name} ◂`;
  const nodeEl = document.getElementById("node-indicator");
  if (nodeEl) nodeEl.textContent = `NODE ${run.node}/${BOSS_NODE}`;
  const bestEl = document.getElementById("best-run-line");
  if (bestEl) bestEl.textContent = `BEST RUN: NODE ${run.bestNode}/${BOSS_NODE}`;

  resetTerminal();
  // Node-breach boot sequence. Fills the terminal (~6 lines at 11.52px/1.7lh
  // in a 160px box) so it genuinely auto-scrolls as the fight progresses —
  // and gives each node breach its own "system coming online" feel.
  log(`[SYS] Breaching node ${run.node}/${BOSS_NODE} — ${def.name}`, "system");
  log(`[SYS] Core integrity: ${def.hp} HP · Threat level: ATK ${def.attackDmg}`, "system");
  log(`[SYS] Uplink stable · ${CARD_TYPES.length} primitives cached`, "info");
  log(`[SYS] RAM buffer ${player.ram}/${player.maxRam} · standing by`, "info");
  log(`[SYS] Firewall heuristics active — breach the core to advance`, "warning");
  log(`[SYS] Compile complete. Awaiting command.`, "info");
  updateEnemyIntent();
}

function initGame() {
  player = { hp: 50, maxHp: 50, ram: 3, maxRam: 3, block: 0, varX: 0, loopMult: 1 };
  run.node = 1;
  gameOver = false;
  loadEnemy();
  drawHand();
  updateUI();
}

function startNextNode() {
  run.node += 1;
  gameOver = false;
  loadEnemy();
  drawHand();
  updateUI();
}

function drawHand() {
  hand = [];
  for (let i = 0; i < 5; i++) {
    hand.push({ ...CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)] });
  }
  renderHand();
}

function renderHand() {
  const container = document.getElementById("hand-container");
  if (!container) return;
  container.innerHTML = "";
  
  hand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    let rarityBorder = "border-[#3b3f6b]";
    let stickerClass = "common";
    
    if (card.rarity === 'rare') {
      rarityBorder = "border-balatro-purple";
      stickerClass = "rare";
    } else if (card.rarity === 'epic') {
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
        playCard(index, cardEl);
      }
    });

    cardEl.onclick = () => playCard(index, cardEl);
    container.appendChild(cardEl);
  });

  animateHandStagger(container);
}

function playCard(index, cardEl) {
  audioEngine.ensureContext();
  if (isAnimating || gameOver) return;
  const card = hand[index];
  if (!card) return;

  if (player.ram < card.ram) {
    audioEngine.playInsufficientRam();
    animateInsufficientRam(cardEl);
    log("[ERROR] Insufficient RAM!", "system");
    return;
  }

  isAnimating = true;
  player.ram -= card.ram;
  audioEngine.playCard(card.type);
  log(`⟫ Execute: ${card.code}`, "player");

  animateCardPlay(cardEl, () => {
    // Snapshot the card's on-screen rect before it's removed, so the attack
    // bolt can launch from exactly where the card was played.
    lastPlayRect = cardEl.getBoundingClientRect();
    card.action();
    hand.splice(index, 1);
    renderHand();
    updateUI();
    checkWinLoss();
    isAnimating = false;
  });
}

function dealDamageToEnemy(amount) {
  const prevHp = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  const dealt = prevHp - enemy.hp;

  // Boosted hits (x ≥ 8 or a looped attack) read as criticals: gold number,
  // gold impact ring, and a deeper, louder hit sound scaled to the damage.
  const isCrit = amount >= 12;
  const enemyBox = document.getElementById("enemyBox");
  if (dealt > 0) {
    // Action animation: the card's energy bolt arcs from the hand onto the
    // enemy, the player's hand kicks back in recoil, and the landing moment
    // triggers the shake + impact flash + hit sound.
    animateHandRecoil();
    animateAttackBolt(lastPlayRect, enemyBox, {
      onImpact: () => {
        animateEnemyDamage(enemyBox);
        animateHitFlash(enemyBox, isCrit ? "gold" : "blue");
        audioEngine.playEnemyHit(dealt);
        if (isCrit) animateFloatDamage("CRIT!", "crit", "52%", "20%");
      },
    });
    animateFloatDamage(`-${dealt}`, isCrit ? "crit" : "enemy", "60%", "30%");

    const enemyHpEl = document.getElementById("enemy-hp");
    if (enemyHpEl) {
      enemyHpEl.classList.add("damaged");
      setTimeout(() => enemyHpEl.classList.remove("damaged"), 400);
    }
  }
}

function endTurn() {
  audioEngine.ensureContext();
  if (isAnimating || gameOver) return;

  audioEngine.playExecuteTurn();
  log(`[ENEMY] ${enemy.name} initiates COUNTER_ATTACK...`, "system");

  let actualDmg = enemy.attackDmg - player.block;
  let blocked = Math.min(player.block, enemy.attackDmg);
  if (actualDmg < 0) actualDmg = 0;

  player.block = Math.max(0, player.block - enemy.attackDmg);
  player.hp = Math.max(0, player.hp - actualDmg);

  if (blocked > 0) audioEngine.playBlock();
  if (actualDmg > 0) audioEngine.playDamageTaken();

  // Action sequence: telegraph (red threat glow) → lunge toward the player →
  // impact (terminal flash + damage numbers). Game state above is updated
  // synchronously so UI text is always current; only the visual feedback is
  // staged to land at the strike moment.
  const enemyBox = document.getElementById("enemyBox");
  const terminal = document.getElementById("terminal");
  const onImpact = () => {
    animateHitFlash(terminal, "red");
    if (blocked > 0) {
      log(`[BLOCK] Deflected ${blocked} damage!`, "info");
      animateFloatDamage(`BLOCKED ${blocked}`, "block", "25%", "45%");
    }
    if (actualDmg > 0) {
      log(`[DAMAGE] System took ${actualDmg} damage!`, "system");
      animateFloatDamage(`-${actualDmg}`, "player", "35%", "55%");
    } else if (blocked >= enemy.attackDmg) {
      log("[BLOCK] Damage fully negated!", "info");
    }
  };
  // Block card plays / double end-turn while the enemy's attack sequence
  // (telegraph → lunge → impact → recoil) is playing, so the player can't
  // interleave a card mid-animation (two Motion writers on the enemyBox).
  isAnimating = true;
  animateEnemyTelegraph(enemyBox, () => {
    animateEnemyAttack(enemyBox, onImpact, () => {
      isAnimating = false;
    });
  });

  const intents = ["attack", "attack", "attack", "defend", "buff"];
  enemy.intent = intents[Math.floor(Math.random() * intents.length)];
  updateEnemyIntent();

  player.ram = player.maxRam;
  drawHand();
  updateUI();
  checkWinLoss();
}

function updateEnemyIntent() {
  const intentEl = document.getElementById("enemy-intent");
  if (!intentEl) return;
  const icon = intentEl.querySelector(".intent-icon");
  const text = intentEl.querySelector("span:last-child");

  switch (enemy.intent) {
    case "attack":
      intentEl.className = "intent-box text-[0.65rem] px-2 py-1.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-2 mt-2 border border-balatro-red/30 text-balatro-red bg-balatro-red/10";
      icon.innerHTML = ICONS.sword;
      text.textContent = `ATTACK (${enemy.attackDmg} DMG)`;
      break;
    case "defend":
      intentEl.className = "intent-box text-[0.65rem] px-2 py-1.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-2 mt-2 border border-balatro-blue/30 text-balatro-blue bg-balatro-blue/10";
      icon.innerHTML = ICONS.shield;
      text.textContent = "DEFENSE MATRIX";
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 4);
      log("[ENEMY] Defense Matrix: +4 HP", "warning");
      break;
    case "buff":
      intentEl.className = "intent-box text-[0.65rem] px-2 py-1.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-2 mt-2 border border-balatro-purple/30 text-balatro-purple bg-balatro-purple/10";
      icon.innerHTML = ICONS.trend;
      text.textContent = "ATTACK BUFF +3";
      enemy.attackDmg += 3;
      log("[ENEMY] Attack buffed! DMG ↑", "warning");
      break;
  }
}

function log(msg, type) {
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

function updateUI() {
  document.getElementById("player-hp").innerText = `${player.hp}/${player.maxHp}`;
  const hpPct = Math.min(1, Math.max(0, player.hp / player.maxHp));
  const hpFill = document.getElementById("hpBarFill");
  if (hpFill) {
    hpFill.style.transform = `scaleX(${hpPct})`;
  }

  document.getElementById("player-ram").innerText = `${player.ram}/${player.maxRam}`;
  document.getElementById("ramBarFill").style.transform = `scaleX(${Math.min(1, Math.max(0, player.ram / player.maxRam))})`;
  document.getElementById("var-x").innerText = player.varX;
  document.getElementById("player-block").innerText = player.block;
  document.getElementById("ramDisplay").innerText = `RAM: ${player.ram}/${player.maxRam}`;

  document.getElementById("enemy-hp").innerText = `${enemy.hp}/${enemy.maxHp}`;
  document.getElementById("enemyHpFill").style.transform = `scaleX(${Math.min(1, Math.max(0, enemy.hp / enemy.maxHp))})`;
}

function checkWinLoss() {
  if (gameOver) return;
  const enemyBox = document.getElementById("enemyBox");
  const terminal = document.getElementById("terminal");
  if (enemy.hp <= 0) {
    gameOver = true;
    audioEngine.playVictory();
    animateBurst(enemyBox, "green");
    if (run.node >= BOSS_NODE) {
      // Full run victory — record completion and show the final overlay.
      run.bestNode = BOSS_NODE;
      try {
        localStorage.setItem("syntack_best_node", String(run.bestNode));
      } catch {}
      const bestEl = document.getElementById("best-run-line");
      if (bestEl) bestEl.textContent = `BEST RUN: NODE ${run.bestNode}/${BOSS_NODE}`;
      setTimeout(() => {
        log("[VICTORY] Mainframe hacked! You win!", "info");
        animateFloatDamage("VICTORY!", "buff", "40%", "35%");
        setTimeout(() => {
          showEndOverlay(true, "You breached the mainframe and deleted the Firewall Daemon.");
        }, 600);
      }, 300);
    } else {
      // Node cleared → reward screen before advancing to the next node.
      setTimeout(() => {
        log(`[NODE CLEARED] Node ${run.node}/${BOSS_NODE} secured.`, "info");
        animateFloatDamage("NODE CLEARED!", "buff", "40%", "35%");
        setTimeout(() => showRewardOverlay(), 600);
      }, 300);
    }
  } else if (player.hp <= 0) {
    gameOver = true;
    audioEngine.playDefeat();
    animateBurst(terminal, "red");
    setTimeout(() => {
      log("[GAME OVER] System crashed...", "system");
      animateFloatDamage("SYSTEM FAILURE", "enemy", "35%", "35%");
      setTimeout(() => {
        showEndOverlay(false, `The ${enemy.name} overwhelmed your system. (Reached node ${run.node}/${BOSS_NODE})`);
      }, 600);
    }, 300);
  }
}

function showEndOverlay(isVictory, subText) {
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

function hideEndOverlay() {
  const overlay = document.getElementById("end-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("flex");
}

function wireEndOverlay() {
  const again = document.getElementById("btn-end-again");
  if (again) {
    again.onclick = () => {
      audioEngine.playExecuteTurn();
      hideEndOverlay();
      initGame(); // fresh run from node 1
    };
  }
}

/* ── Reward screen (shown between nodes 1-3 clears) ── */
function showRewardOverlay() {
  const overlay = document.getElementById("reward-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  overlay.classList.add("flex");
  // REPAIR is pointless (and would silently waste the pick) at full HP.
  const healBtn = document.getElementById("btn-reward-heal");
  if (healBtn) healBtn.disabled = player.hp >= player.maxHp;
  setTimeout(() => focusFirstFocusable(overlay), 50);
}

function hideRewardOverlay() {
  const overlay = document.getElementById("reward-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("flex");
}

function wireRewardOverlay() {
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
        startNextNode();
        // Move focus into the fresh node's hand — the reward button just
        // disappeared with the overlay, so don't leave focus stranded on <body>.
        const firstCard = document.querySelector("#hand-container .card");
        if (firstCard) firstCard.focus();
      };
    }
  });
}

// Render Card Archive Modal Content
function renderArchiveCards() {
  const container = document.getElementById("archive-cards-list");
  if (!container) return;
  container.innerHTML = "";

  CARD_TYPES.forEach((card) => {
    const cardEl = document.createElement("div");
    let rarityBorder = "border-[#3b3f6b]";
    let stickerClass = "common";

    if (card.rarity === 'rare') {
      rarityBorder = "border-balatro-purple";
      stickerClass = "rare";
    } else if (card.rarity === 'epic') {
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

// Navigation & Screen Control Functions
function setupNavigation() {
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
      // Defer initGame() until the transition finishes: if it ran here, the
      // hand deal-in would play while #game-screen is still display:none (K1).
      // initGame() is the onComplete so the arena is fully on screen first.
      animateScreenTransition(homeScreen, gameScreen, initGame);
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

  // Keyboard a11y: Escape closes modals, Tab is trapped inside an open modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [archiveModal, rulesModal].forEach((modal) => {
        if (modal && !modal.classList.contains("hidden")) {
          animateModalClose(modal);
          if (lastFocusedEl) lastFocusedEl.focus();
        }
      });
    }

    if (e.key === "Tab") {
      const open = [archiveModal, rulesModal, endOverlay, rewardOverlay].find((m) => m && !m.classList.contains("hidden"));
      if (open) trapFocus(open, e);
    }
  });
}

let lastFocusedEl = null;

function focusFirstFocusable(container) {
  if (!container) return;
  const focusables = container.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
}

function trapFocus(container, e) {
  if (!container) return;
  const focusables = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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

// Global Audio controls setup
function setupAudioUI() {
  const muteBtn = document.getElementById("btnMute");
  const muteHomeBtn = document.getElementById("btnMuteHome");
  const volSlider = document.getElementById("volSlider");
  const volSliderHome = document.getElementById("volSliderHome");

  const updateMuteState = (muted) => {
    [muteBtn, muteHomeBtn].forEach((btn) => {
      if (btn) {
        btn.classList.toggle("muted", muted);
        btn.querySelector(".btn-label").textContent = muted ? "AUDIO: OFF" : "AUDIO: ON";
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

  // Reflect persisted mute state (icon + label + aria-pressed)
  updateMuteState(audioEngine.isMuted);

  const unlockAudio = () => {
    audioEngine.ensureContext();
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("click", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
}

// Bind to window for HTML button onclick events
window.endTurn = endTurn;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupAudioUI();
  wireEndOverlay();
  wireRewardOverlay();
});

/* ════════════════════════════════════════════════════════════════════
   QA TEST HOOK — no-op in production (see visual-check-spec.md §7)
   Activated only via URL params:
     ?test=1&screen=arena&seed=<n>&intent=attack|defend|buff
     &node=1|2|3|4&outcome=victory|defeat|reward
   Used by qa/run.mjs to force deterministic, reproducible game states.
   Never fires audio and uses no timers the harness cannot predict.
   ════════════════════════════════════════════════════════════════════ */
const qaParams = new URLSearchParams(location.search);

// Deterministic RNG (mulberry32). Installed at module scope — before any
// drawHand() -> Math.random() call — so hands are reproducible across
// viewports and runs. Applied whenever a numeric `seed` is present (the
// harness also seeds non-hook scenarios for stable arena screenshots).
const qaSeedRaw = qaParams.get("seed");
// Note: Number("") is 0, so an empty ?seed= must not silently seed with 0.
if (qaSeedRaw !== null && qaSeedRaw !== "" && Number.isFinite(Number(qaSeedRaw))) {
  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = mulberry32(Number(qaSeedRaw) >>> 0);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!qaParams.get("test") || qaParams.get("screen") !== "arena") return;

  // Jump straight to the arena with a direct class swap (no animated
  // splash/home flow) so the hook stays free of audio + motion timers.
  const splash = document.getElementById("splash-screen");
  const home = document.getElementById("home-screen");
  const game = document.getElementById("game-screen");
  if (splash) {
    splash.classList.add("hidden");
    splash.classList.remove("flex");
  }
  if (home) {
    home.classList.add("hidden");
    home.classList.remove("flex");
  }
  if (game) {
    game.classList.remove("hidden");
    game.classList.add("flex");
  }
  initGame();

  // Jump to a specific node (exercises each roster entry's HP/name rendering).
  const qaNode = Number(qaParams.get("node"));
  if (Number.isInteger(qaNode) && qaNode >= 1 && qaNode <= BOSS_NODE && qaNode !== run.node) {
    run.node = qaNode;
    loadEnemy();
    updateUI(); // loadEnemy sets state + name/node labels; updateUI syncs HP/RAM bars
  }

  // Force an enemy intent (exercises all three intent UIs — spec §6.4 #7).
  const qaIntent = qaParams.get("intent");
  if (qaIntent === "attack" || qaIntent === "defend" || qaIntent === "buff") {
    enemy.intent = qaIntent;
    updateEnemyIntent(); // updates DOM + side effects (defend heals, buff raises ATK)
  }

  // Force the end state, skipping natural play (spec §6.4 #8).
  const qaOutcome = qaParams.get("outcome");
  if (qaOutcome === "reward") {
    showRewardOverlay();
  } else if (qaOutcome === "victory" || qaOutcome === "defeat") {
    gameOver = true;
    showEndOverlay(
      qaOutcome === "victory",
      qaOutcome === "victory"
        ? "You breached the mainframe and deleted the Firewall Daemon."
        : "The Firewall Daemon overwhelmed your system."
    );
  }
});
