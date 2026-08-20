/**
 * SYNTACK — Combat System
 * Damage dealing, enemy turns, intent updates, and win/loss checks.
 */

import { player, enemy, run, BOSS_NODE, isAnimating, gameOver, lastPlayRect, setGameOver } from "./state.js";
import { ICONS } from "./icons.js";
import { log, updateUI } from "./renderer.js";
import { audioEngine } from "./audio.js";
import {
  animateHandRecoil,
  animateAttackBolt,
  animateEnemyDamage,
  animateHitFlash,
  animateFloatDamage,
  animateBurst,
  animateEnemyTelegraph,
  animateEnemyAttack,
} from "./motion.js";
import { showEndOverlay, showRewardOverlay } from "./reward.js";

export function dealDamageToEnemy(amount) {
  const prevHp = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  const dealt = prevHp - enemy.hp;

  const isCrit = amount >= 12;
  const enemyBox = document.getElementById("enemyBox");
  if (dealt > 0) {
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

export function endTurn(drawHandFn) {
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
  drawHandFn();
  updateUI();
  checkWinLoss();
}

export function updateEnemyIntent() {
  const intentEl = document.getElementById("enemy-intent");
  if (!intentEl) return;
  const icon = intentEl.querySelector(".intent-icon");
  const text = intentEl.querySelector("span:last-child");

  switch (enemy.intent) {
    case "attack":
      intentEl.className =
        "intent-box text-[0.65rem] px-2 py-1.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-2 mt-2 border border-balatro-red/30 text-balatro-red bg-balatro-red/10";
      icon.innerHTML = ICONS.sword;
      text.textContent = `ATTACK (${enemy.attackDmg} DMG)`;
      break;
    case "defend":
      intentEl.className =
        "intent-box text-[0.65rem] px-2 py-1.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-2 mt-2 border border-balatro-blue/30 text-balatro-blue bg-balatro-blue/10";
      icon.innerHTML = ICONS.shield;
      text.textContent = "DEFENSE MATRIX";
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 4);
      log("[ENEMY] Defense Matrix: +4 HP", "warning");
      break;
    case "buff":
      intentEl.className =
        "intent-box text-[0.65rem] px-2 py-1.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-2 mt-2 border border-balatro-purple/30 text-balatro-purple bg-balatro-purple/10";
      icon.innerHTML = ICONS.trend;
      text.textContent = "ATTACK BUFF +3";
      enemy.attackDmg += 3;
      log("[ENEMY] Attack buffed! DMG ↑", "warning");
      break;
  }
}

export function checkWinLoss() {
  if (gameOver) return;
  const enemyBox = document.getElementById("enemyBox");
  const terminal = document.getElementById("terminal");
  if (enemy.hp <= 0) {
    setGameOver(true);
    audioEngine.playVictory();
    animateBurst(enemyBox, "green");
    if (run.node >= BOSS_NODE) {
      run.bestNode = BOSS_NODE;
      try {
        localStorage.setItem("syntack_best_node", String(run.bestNode));
      } catch {}
      const bestEl = document.getElementById("best-run-line");
      if (bestEl)
        bestEl.textContent = `BEST RUN: NODE ${run.bestNode}/${BOSS_NODE}`;
      setTimeout(() => {
        log("[VICTORY] Mainframe hacked! You win!", "info");
        animateFloatDamage("VICTORY!", "buff", "40%", "35%");
        setTimeout(() => {
          showEndOverlay(
            true,
            "You breached the mainframe and deleted the Firewall Daemon.",
          );
        }, 600);
      }, 300);
    } else {
      setTimeout(() => {
        log(`[NODE CLEARED] Node ${run.node}/${BOSS_NODE} secured.`, "info");
        animateFloatDamage("NODE CLEARED!", "buff", "40%", "35%");
        setTimeout(() => showRewardOverlay(), 600);
      }, 300);
    }
  } else if (player.hp <= 0) {
    setGameOver(true);
    audioEngine.playDefeat();
    animateBurst(terminal, "red");
    setTimeout(() => {
      log("[GAME OVER] System crashed...", "system");
      animateFloatDamage("SYSTEM FAILURE", "enemy", "35%", "35%");
      setTimeout(() => {
        showEndOverlay(
          false,
          `The ${enemy.name} overwhelmed your system. (Reached node ${run.node}/${BOSS_NODE})`,
        );
      }, 600);
    }, 300);
  }
}
