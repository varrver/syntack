/**
 * SYNTACK — Game Orchestrator
 * Wires modules together, manages hand/card play, and initializes on load.
 * This is the entry point — all game logic lives in focused modules.
 */

import {
  player, enemy, run, hand, gameOver, isAnimating, lastPlayRect,
  setHand, setIsAnimating, setGameOver, setLastPlayRect,
  ENEMY_ROSTER, BOSS_NODE, world, playerSprite, enemySprite, setWorldPhase,
} from "./state.js";
import { CARD_TYPES } from "./cards.js";
import { audioEngine } from "./audio.js";
import {
  animateCardPlay,
  animateInsufficientRam,
} from "./motion.js";
import { resetTerminal, log, renderHand, updateUI, updateEnemySprite, drawScene, initCanvasRenderer } from "./renderer.js";
import { dealDamageToEnemy, endTurn, updateEnemyIntent, checkWinLoss } from "./combat.js";
import { setupNavigation } from "./navigation.js";
import {
  wireEndOverlay,
  wireRewardOverlay,
  showRewardOverlay,
  showEndOverlay,
} from "./reward.js";
import { initQaHook } from "./qa-hook.js";
import { setupAudioUI } from "./audio-ui.js";

let lastTimestamp = 0;
let _gameScreenEl = null;

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  if (!_gameScreenEl) _gameScreenEl = document.getElementById("game-screen");
  if (!_gameScreenEl || _gameScreenEl.classList.contains("hidden")) {
    lastTimestamp = timestamp;
    return;
  }

  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000 || 0.016);
  lastTimestamp = timestamp;

  if (world.phase === "RUNNING") {
    world.scrollX += world.scrollSpeed * dt;
    playerSprite.animState = "run";

    if (enemySprite.x > 620) {
      enemySprite.x = Math.max(620, enemySprite.x - 220 * dt);
      enemySprite.animState = "run";
    } else {
      setWorldPhase("BATTLE");
      playerSprite.animState = "idle";
      enemySprite.animState = "idle";
      enemySprite.opacity = 1;
    }
  }

  drawScene(dt);
}

export function loadEnemy() {
  const def = ENEMY_ROSTER[run.node - 1] || ENEMY_ROSTER[0];
  enemy.hp = def.hp;
  enemy.maxHp = def.hp;
  enemy.attackDmg = def.attackDmg;
  enemy.intent = "attack";
  enemy.name = def.name;

  player.block = 0;
  player.varX = 0;
  player.loopMult = 1;
  player.ram = player.maxRam;

  // Setup enemy entry position for wave transition
  enemySprite.x = 850;
  enemySprite.opacity = 1;
  enemySprite.animState = "run";
  setWorldPhase("RUNNING");

  run.bestNode = Math.max(run.bestNode, run.node);
  try {
    localStorage.setItem("syntack_best_node", String(run.bestNode));
  } catch {}

  const nameEl = document.getElementById("enemy-name");
  if (nameEl) nameEl.textContent = `▸ ${def.name} ◂`;
  updateEnemySprite(def.name);
  const nodeEl = document.getElementById("node-indicator");
  if (nodeEl) nodeEl.textContent = `NODE ${run.node}/${BOSS_NODE}`;
  const bestEl = document.getElementById("best-run-line");
  if (bestEl)
    bestEl.textContent = `BEST RUN: NODE ${run.bestNode}/${BOSS_NODE}`;

  resetTerminal();
  log(`[SYS] Breaching node ${run.node}/${BOSS_NODE} — ${def.name}`, "system");
  log(
    `[SYS] Core integrity: ${def.hp} HP · Threat level: ATK ${def.attackDmg}`,
    "system",
  );
  log(`[SYS] Uplink stable · ${CARD_TYPES.length} primitives cached`, "info");
  log(`[SYS] RAM buffer ${player.ram}/${player.maxRam} · standing by`, "info");
  log(
    `[SYS] Auto-runner engaged — eliminate node core`,
    "warning",
  );
  log(`[SYS] Compile complete. Awaiting command.`, "info");
  updateEnemyIntent();
  updateUI();
}


export function initGame() {
  player.hp = 50;
  player.maxHp = 50;
  player.ram = 3;
  player.maxRam = 3;
  player.block = 0;
  player.varX = 0;
  player.loopMult = 1;
  run.node = 1;
  setGameOver(false);
  loadEnemy();
  drawHand();
  updateUI();
}

export function startNextNode() {
  run.node += 1;
  setGameOver(false);
  loadEnemy();
  drawHand();
  updateUI();
}

export function drawHand() {
  const newHand = [];
  for (let i = 0; i < 5; i++) {
    newHand.push({ ...CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)] });
  }
  setHand(newHand);
  renderHand(playCard);
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

  setIsAnimating(true);
  player.ram -= card.ram;
  audioEngine.playCard(card.type);
  log(`⟫ Execute: ${card.code}`, "player");

  animateCardPlay(cardEl, () => {
    setLastPlayRect(cardEl.getBoundingClientRect());
    card.action(dealDamageToEnemy);
    hand.splice(index, 1);
    renderHand(playCard);
    updateUI();
    checkWinLoss();
    setIsAnimating(false);
  });
}

function endTurnHandler() {
  endTurn(drawHand);
}

document.addEventListener("DOMContentLoaded", () => {
  initCanvasRenderer();
  requestAnimationFrame(gameLoop);

  setupNavigation(initGame);
  setupAudioUI();
  wireEndOverlay(initGame);
  wireRewardOverlay(startNextNode);

  const endTurnBtn = document.getElementById("btn-end-turn");
  if (endTurnBtn) {
    endTurnBtn.addEventListener("click", endTurnHandler);
  }

  initQaHook({
    initGame,
    loadEnemy,
    showRewardOverlay,
    showEndOverlay,
  });
});



