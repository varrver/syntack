import { player, enemy, run, BOSS_NODE, isAnimating, gameOver, lastPlayRect, setGameOver, setIsAnimating, playerSprite, enemySprite, projectiles, particles, screenShake } from "./state.js";
import { ICONS } from "./icons.js";
import { log, updateUI } from "./renderer.js";
import { audioEngine } from "./audio.js";
import {
  animateHandRecoil,
  animateEnemyDamage,
  animateHitFlash,
  animateFloatDamage,
  animateBurst,
  animateEnemyTelegraph,
  animateEnemyAttack,
} from "./motion.js";
import { showEndOverlay, showRewardOverlay } from "./reward.js";

function triggerShake(intensity = 6, duration = 0.28) {
  screenShake.intensity = intensity;
  screenShake.duration = duration;
  screenShake.t = duration;
}

export function dealDamageToEnemy(amount) {
  const prevHp = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  const dealt = prevHp - enemy.hp;

  const isCrit = amount >= 12;
  const enemyBox = document.getElementById("enemyBox");

  if (dealt > 0) {
    animateHandRecoil();
    
    // Spawn bullet projectile on canvas from robot gun muzzle to enemy
    projectiles.push({
      x: playerSprite.x + 75,
      y: worldYToMuzzleY(),
      vx: 850,
      vy: 0,
      targetX: enemySprite.x + 25,
      onImpact: () => {
        enemySprite.animState = "hurt";
        triggerShake(3 + Math.min(7, dealt * 0.4), 0.25);
        setTimeout(() => {
          if (enemySprite.animState === "hurt" && !enemySprite.dead) enemySprite.animState = "idle";
        }, 350);

        // Spawn spark particles on impact
        for (let i = 0; i < 8; i++) {
          particles.push({
            x: enemySprite.x + 25,
            y: worldYToMuzzleY() + (Math.random() * 30 - 15),
            vx: Math.random() * 200 - 100,
            vy: Math.random() * 200 - 100,
            r: isCrit ? 245 : 0,
            g: isCrit ? 197 : 157,
            b: isCrit ? 66 : 220,
            life: 0.35,
            maxLife: 0.35,
            radius: Math.random() * 3 + 2,
          });
        }

        animateEnemyDamage(enemyBox);
        animateHitFlash(enemyBox, isCrit ? "gold" : "blue");
        audioEngine.playEnemyHit(dealt);
        if (isCrit) animateFloatDamage("CRIT!", "crit", "52%", "20%");
        animateFloatDamage(`-${dealt}`, isCrit ? "crit" : "enemy", "60%", "30%");

        const enemyHpEl = document.getElementById("enemy-hp");
        if (enemyHpEl) {
          enemyHpEl.classList.add("damaged");
          setTimeout(() => enemyHpEl.classList.remove("damaged"), 400);
        }
      },
    });
  }
}

function worldYToMuzzleY() {
  return 210 - 90 + 45; // groundY - pDrawH + muzzleOffset
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
  
  enemySprite.animState = "attack";

  const onImpact = () => {
    animateHitFlash(terminal, "red");
    if (actualDmg > 0) {
      triggerShake(9 + Math.min(6, actualDmg * 0.3), 0.32);
      playerSprite.animState = "hurt";
      setTimeout(() => {
        if (playerSprite.animState === "hurt") playerSprite.animState = "idle";
      }, 350);
    } else if (blocked > 0) {
      triggerShake(4, 0.2);
    }

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

  setIsAnimating(true);
  animateEnemyTelegraph(enemyBox, () => {
    animateEnemyAttack(enemyBox, onImpact, () => {
      enemySprite.animState = "idle";
      setIsAnimating(false);
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

  const INTENT_BASE = "intent-box text-[0.45rem] sm:text-[0.5rem] px-2 py-0.5 rounded tracking-[1px] uppercase inline-flex items-center justify-center gap-1 mt-0.5 bg-black/75";

  switch (enemy.intent) {
    case "attack":
      intentEl.className = `${INTENT_BASE} border border-balatro-red/20 text-balatro-red/80`;
      if (icon) icon.innerHTML = ICONS.sword;
      if (text) text.textContent = `ATTACK ${enemy.attackDmg}`;
      break;
    case "defend":
      intentEl.className = `${INTENT_BASE} border border-balatro-blue/20 text-balatro-blue/80`;
      if (icon) icon.innerHTML = ICONS.shield;
      if (text) text.textContent = "DEFEND +4";
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 4);
      log("[ENEMY] Defense Matrix: +4 HP", "warning");
      break;
    case "buff":
      intentEl.className = `${INTENT_BASE} border border-balatro-purple/20 text-balatro-purple/80`;
      if (icon) icon.innerHTML = ICONS.trend;
      if (text) text.textContent = "BUFF +3";
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
    enemySprite.animState = "death";
    enemySprite.dead = true;
    // Corpse drops and rewards open right away — the victory walk past
    // the body plays later, after selections, via runVictoryWalk()
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
        }, 500);
      }, 250);
    } else {
      setTimeout(() => {
        log(`[NODE CLEARED] Node ${run.node}/${BOSS_NODE} secured.`, "info");
        animateFloatDamage("NODE CLEARED!", "buff", "40%", "35%");
        setTimeout(() => showRewardOverlay(), 450);
      }, 250);
    }
  } else if (player.hp <= 0) {
    setGameOver(true);
    playerSprite.animState = "hurt";
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

