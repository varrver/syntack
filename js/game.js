/**
 * SYNTACK — Game Orchestrator
 * Wires modules together, manages hand/card play, and initializes on load.
 * This is the entry point — all game logic lives in focused modules.
 */

import {
  player, enemy, run, hand, deck, setDeck, gameOver, isAnimating, lastPlayRect,
  setHand, setIsAnimating, setGameOver, setLastPlayRect,
  ENEMY_ROSTER, BOSS_NODE, world, playerSprite, enemySprite, setWorldPhase,
  freshStats,
} from "./state.js";
import { CARD_TYPES, STARTER_DECK, getCardById } from "./cards.js";
import { audioEngine } from "./audio.js";
import {
  animateCardPlay,
  animateInsufficientRam,
  runBattleIntro,
  animateScreenTransition,
  REDUCED_MOTION,
} from "./motion.js";
import { resetTerminal, log, renderHand, updateUI, updateEnemySprite, drawScene, initCanvasRenderer, logicalWorldWidth } from "./renderer.js";
import { dealDamageToEnemy, endTurn, updateEnemyIntent, checkWinLoss } from "./combat.js";
import { setupNavigation } from "./navigation.js";
import {
  wireEndOverlay,
  wireRewardOverlay,
  showRewardOverlay,
  showCardReward,
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
    // Treadmill approach — the player holds screen-left while the camera
    // pushes down the corridor. The enemy is anchored in the world, so
    // closing the distance reads as walking up to a standing foe.
    // Reduced motion skips the run entirely (arrives on the first frame).
    const step = Math.min(
      (REDUCED_MOTION ? Infinity : world.runSpeed) * dt,
      world.runRemaining,
    );
    world.camX += step;
    world.runRemaining -= step;
    playerSprite.x = world.camX + 80;
    if (world.runRemaining <= 0) {
      setWorldPhase("BATTLE");
      playerSprite.animState = "idle";
      enemySprite.animState = "idle";
      enemySprite.opacity = 1;
    }
  }

  if (world.phase === "VICTORY") {
    // Walk through/past the fallen enemy while the camera keeps following
    playerSprite.animState = "run";
    playerSprite.x += 270 * dt;
    const w = logicalWorldWidth();
    world.camX = Math.max(world.camX, playerSprite.x - (w / 2 - 60));
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

  // Each node is an approach run: the player holds screen-left while the
  // camera covers the corridor; the enemy waits, anchored in the world.
  // Distance grows slightly per node but speed scales with it, so every
  // run-in lands in ~1.6s with the enemy on screen for most of it.
  const approachDist = 300 + run.node * 60;
  world.runRemaining = approachDist;
  world.runSpeed = approachDist / 1.6;
  enemySprite.x = logicalWorldWidth() - 200 + world.runRemaining;
  enemySprite.dead = false;
  enemySprite.opacity = 1;
  enemySprite.animState = "idle";
  enemySprite.frame = 0;
  playerSprite.x = 80;
  playerSprite.animState = "run";
  world.camX = 0;
  setWorldPhase("RUNNING");
  runBattleIntro(run.node, def.name);

  run.bestNode = Math.max(run.bestNode, run.node);
  try {
    localStorage.setItem("syntack_best_node", String(run.bestNode));
  } catch {}

  const nameEl = document.getElementById("enemy-name");
  if (nameEl) nameEl.textContent = def.name;
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

export function resetRun() {
  player.hp = 50;
  player.maxHp = 50;
  player.ram = 3;
  player.maxRam = 3;
  player.block = 0;
  player.varX = 0;
  player.loopMult = 1;
  run.node = 1;
  run.stats = freshStats();
  setDeck([...STARTER_DECK]);
  setGameOver(false);
}

/** Deploy into the current run.node — approach run starts immediately. */
function deployNode() {
  loadEnemy();
  drawHand();
  updateUI();
}

/**
 * Legacy one-shot start (QA hook, forced flows): reset and drop straight
 * into node 1 without passing through the staging lobby.
 */
export function initGame() {
  resetRun();
  deployNode();
}

/**
 * Lobby-aware start: reset the run and stage the lobby; the arena only
 * deploys when the player hits BREACH NODE.
 */
export function startRun() {
  resetRun();
  enterLobby();
}

function setLobbyText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderLobbyDeck() {
  const wrap = document.getElementById("lobby-deck");
  if (!wrap) return;
  const counts = new Map();
  deck.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  wrap.replaceChildren();
  [...counts.entries()].forEach(([id, count]) => {
    const card = getCardById(id);
    if (!card) return;
    const chip = document.createElement("span");
    chip.className = `lobby-deck-chip type-${card.type}`;
    chip.textContent = count > 1 ? `${card.code} ×${count}` : card.code;
    wrap.appendChild(chip);
  });
}

/** Populate the staging lobby from live run state. */
export function enterLobby() {
  const def = ENEMY_ROSTER[run.node - 1] || ENEMY_ROSTER[0];
  setLobbyText("lobby-node-label", `NEXT TARGET: NODE ${run.node}/${BOSS_NODE}`);
  setLobbyText("lobby-enemy-line", `${def.name} · ${def.hp} HP · ATK ${def.attackDmg}`);
  setLobbyText("lobby-vitals", `HP ${player.hp}/${player.maxHp} · RAM ${player.maxRam}`);
  setLobbyText("lobby-stat-turns", String(run.stats.turns));
  setLobbyText("lobby-stat-damage", String(run.stats.damageDealt));
  setLobbyText("lobby-stat-cards", String(run.stats.cardsPlayed));
  setLobbyText("lobby-stat-deck", String(deck.length));
  setLobbyText("btn-breach-label", `BREACH NODE ${run.node}`);

  const bestEl = document.getElementById("best-run-line-home");
  if (bestEl)
    bestEl.textContent = `BEST RUN: NODE ${run.bestNode}/${BOSS_NODE}`;

  renderLobbyDeck();
  // Focus BREACH once the lobby is actually on screen — during animated
  // transitions the swap lands a few frames later, so retry briefly
  (function focusBreach(attempt) {
    const btn = document.getElementById("btn-breach-node");
    if (!btn || attempt > 25) return;
    if (btn.checkVisibility && btn.checkVisibility()) {
      btn.focus();
      return;
    }
    setTimeout(() => focusBreach(attempt + 1), 80);
  })(0);
}

/**
 * Victory walk — after rewards are selected, the player runs past the
 * fallen enemy while the camera follows, then hands off to the next node.
 */
export function runVictoryWalk(done) {
  if (!enemySprite.dead || world.phase === "VICTORY") {
    done();
    return;
  }
  setWorldPhase("VICTORY");
  playerSprite.animState = "run";
  const t0 = Date.now();
  const iv = setInterval(() => {
    const passed = playerSprite.x > enemySprite.x + 140;
    const timedOut = Date.now() - t0 > 2400;
    if (passed || timedOut) {
      clearInterval(iv);
      done();
    }
  }, 40);
}

/** Return to the staging lobby from the arena (RUN AGAIN / node cleared). */
function backToLobby() {
  enterLobby();
  animateScreenTransition(
    document.getElementById("game-screen"),
    document.getElementById("lobby-screen"),
  );
}

export function drawHand() {
  // Sample from the run's deck — rewards grow it, so odds shift as you pick
  const pool = deck.length ? deck : CARD_TYPES.map((c) => c.id);
  const newHand = [];
  for (let i = 0; i < 4; i++) {
    newHand.push({ ...getCardById(pool[Math.floor(Math.random() * pool.length)]) });
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
  run.stats.cardsPlayed += 1;
  audioEngine.playCard(card.type);
  log(`⟫ Execute: ${card.code}`, "player");

  // Short beat between selection and execution so the pick reads clearly
  setTimeout(() => {
    animateCardPlay(cardEl, () => {
      setLastPlayRect(cardEl.getBoundingClientRect());
      card.action(dealDamageToEnemy);
      hand.splice(index, 1);
      renderHand(playCard);
      updateUI();
      checkWinLoss();
      setIsAnimating(false);
    });
  }, 180);
}

function endTurnHandler() {
  endTurn(drawHand);
}

async function applyBuildLabel() {
  const el = document.getElementById("splash-build");
  if (!el) return;
  try {
    const { BUILD } = await import("./version.js");
    el.textContent = `build ${BUILD} — vanilla JS`;
  } catch {
    el.textContent = "dev build — vanilla JS";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initCanvasRenderer();
  requestAnimationFrame(gameLoop);

  setupNavigation(startRun);
  setupAudioUI();
  wireEndOverlay(() => {
    resetRun();
    backToLobby();
  });
  wireRewardOverlay(() => {
    showCardReward(() => {
      runVictoryWalk(() => {
        run.node += 1;
        backToLobby();
      });
    });
  });

  const breachBtn = document.getElementById("btn-breach-node");
  if (breachBtn) {
    breachBtn.onclick = () => {
      audioEngine.playExecuteTurn();
      deployNode();
      animateScreenTransition(
        document.getElementById("lobby-screen"),
        document.getElementById("game-screen"),
        () => {
          const firstCard = document.querySelector("#hand-container .card");
          if (firstCard) firstCard.focus();
        },
      );
    };
  }

  const endTurnBtn = document.getElementById("btn-end-turn");
  if (endTurnBtn) {
    endTurnBtn.addEventListener("click", endTurnHandler);
  }

  initQaHook({
    initGame,
    startRun,
    loadEnemy,
    showRewardOverlay,
    showEndOverlay,
  });

  applyBuildLabel();
});



