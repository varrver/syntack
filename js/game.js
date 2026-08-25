/**
 * SYNTACK — Game Orchestrator
 * Wires modules together, manages hand/card play, and initializes on load.
 * This is the entry point — all game logic lives in focused modules.
 */

import {
  player, enemy, run, hand, deck, setDeck, gameOver, isAnimating, lastPlayRect,
  setHand, setIsAnimating, setGameOver, setLastPlayRect,
  ENEMY_ROSTER, BOSS_NODE, world, playerSprite, enemySprite, setWorldPhase,
} from "./state.js";
import { CARD_TYPES, STARTER_DECK, getCardById } from "./cards.js";
import { audioEngine } from "./audio.js";
import {
  animateCardPlay,
  animateInsufficientRam,
  runBattleIntro,
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
const _REDUCED_MOTION =
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const w = logicalWorldWidth();

    if (!world.engaging) {
      // Run-in — centered player POV, camera capped so the enemy stays
      // fully on-screen as the fight closes in
      playerSprite.animState = "run";
      playerSprite.x += 250 * dt;
      const camMax = Math.max(0, enemySprite.x - (w - 210));
      const camDesired = Math.max(0, playerSprite.x - (w / 2 - 60));
      world.camX = Math.min(camMax, camDesired);

      const enemyVisible = enemySprite.x - world.camX <= w - 170;
      if ((playerSprite.x >= enemySprite.x - 300 && enemyVisible) || world.camX >= camMax - 0.5) {
        world.engaging = true;
      }
    } else {
      // Engage slide — both fighters glide into the classic battle
      // framing: player back at screen-left, enemy at screen-right
      const pTarget = world.camX + 80;
      const eTarget = world.camX + (w - 200);
      if (_REDUCED_MOTION) {
        playerSprite.x = pTarget;
        enemySprite.x = eTarget;
      } else {
        const k = Math.min(1, dt * 9);
        playerSprite.animState = "run";
        playerSprite.x += (pTarget - playerSprite.x) * k;
        enemySprite.x += (eTarget - enemySprite.x) * k;
      }
      if (
        Math.abs(playerSprite.x - pTarget) < 1 &&
        Math.abs(enemySprite.x - eTarget) < 1
      ) {
        playerSprite.x = pTarget;
        enemySprite.x = eTarget;
        world.engaging = false;
        setWorldPhase("BATTLE");
        playerSprite.animState = "idle";
        enemySprite.animState = "idle";
        enemySprite.opacity = 1;
      }
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

  // Each node is a run segment: player starts at world 0, enemy stands
  // further down the corridor. Camera starts at 0 and follows the run in.
  enemySprite.x = 900 + run.node * 140;
  enemySprite.dead = false;
  enemySprite.opacity = 1;
  enemySprite.animState = "idle";
  enemySprite.frame = 0;
  playerSprite.x = 0;
  playerSprite.animState = "run";
  world.camX = 0;
  world.engaging = false;
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

export function initGame() {
  player.hp = 50;
  player.maxHp = 50;
  player.ram = 3;
  player.maxRam = 3;
  player.block = 0;
  player.varX = 0;
  player.loopMult = 1;
  run.node = 1;
  setDeck([...STARTER_DECK]);
  setGameOver(false);
  loadEnemy();
  drawHand();
  updateUI();
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

export function startNextNode() {
  run.node += 1;
  setGameOver(false);
  loadEnemy();
  drawHand();
  updateUI();
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

  setupNavigation(initGame);
  setupAudioUI();
  wireEndOverlay(initGame);
  wireRewardOverlay(() => {
    showCardReward(() => {
      runVictoryWalk(() => {
        startNextNode();
        const firstCard = document.querySelector("#hand-container .card");
        if (firstCard) firstCard.focus();
      });
    });
  });

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

  applyBuildLabel();
});



