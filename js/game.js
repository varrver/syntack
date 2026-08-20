/**
 * SYNTACK — Game Orchestrator
 * Wires modules together, manages hand/card play, and initializes on load.
 * This is the entry point — all game logic lives in focused modules.
 */

import {
  player, enemy, run, hand, gameOver, isAnimating, lastPlayRect,
  setHand, setIsAnimating, setGameOver, setLastPlayRect,
  ENEMY_ROSTER, BOSS_NODE,
} from "./state.js";
import { CARD_TYPES } from "./cards.js";
import { audioEngine } from "./audio.js";
import {
  animateCardPlay,
  animateInsufficientRam,
  animateFloatDamage,
} from "./motion.js";
import { resetTerminal, log, renderHand, updateUI } from "./renderer.js";
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

  run.bestNode = Math.max(run.bestNode, run.node);
  try {
    localStorage.setItem("syntack_best_node", String(run.bestNode));
  } catch {}

  const nameEl = document.getElementById("enemy-name");
  if (nameEl) nameEl.textContent = `▸ ${def.name} ◂`;
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
    `[SYS] Firewall heuristics active — breach the core to advance`,
    "warning",
  );
  log(`[SYS] Compile complete. Awaiting command.`, "info");
  updateEnemyIntent();
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
    card.action();
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
    showRewardOverlay,
    showEndOverlay,
  });
});
