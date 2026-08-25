import { run, enemy, world, playerSprite, enemySprite, setGameOver, BOSS_NODE } from "./state.js";
import { updateEnemyIntent } from "./combat.js";
import { logicalWorldWidth } from "./renderer.js";

const qaParams = new URLSearchParams(location.search);

const qaSeedRaw = qaParams.get("seed");
if (
  qaSeedRaw !== null &&
  qaSeedRaw !== "" &&
  Number.isFinite(Number(qaSeedRaw))
) {
  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = mulberry32(Number(qaSeedRaw) >>> 0);
}

// Freeze performance.now() in test mode so time-based canvas FX (e.g. the
// attack-telegraph aura pulse) render at a fixed phase — golden images stay
// deterministic. rAF timestamps are unaffected, so dt-driven animation still
// runs normally.
if (qaParams.get("test")) {
  performance.now = () => 1234.5678;
  // Live refs so harnesses can wait for a stable combat phase and a
  // canonical sprite frame; renderer latches __qaHold itself when armed
  window.__world = world;
  window.__qa = { world, playerSprite, enemySprite };
  window.__qaArm = true;
}

export function initQaHook(callbacks) {
  if (!qaParams.get("test") || qaParams.get("screen") !== "arena") return;

  const splash = document.getElementById("splash-screen");
  const home = document.getElementById("home-screen");
  const game = document.getElementById("game-screen");
  const parallaxBg = document.getElementById("menu-parallax-bg");
  if (parallaxBg) parallaxBg.classList.add("in-game");

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

  const qaNode = Number(qaParams.get("node"));
  callbacks.initGame();

  if (
    Number.isInteger(qaNode) &&
    qaNode >= 1 &&
    qaNode <= BOSS_NODE
  ) {
    run.node = qaNode;
    run.bestNode = Math.max(run.bestNode, qaNode);
    if (callbacks.loadEnemy) callbacks.loadEnemy();
  }


  const qaIntent = qaParams.get("intent");
  if (qaIntent === "attack" || qaIntent === "defend" || qaIntent === "buff") {
    enemy.intent = qaIntent;
    updateEnemyIntent();
  }

  // Snap straight to battle stance — skipping the RUNNING walk-in keeps
  // world.camX (camera offset) identical across capture runs
  enemySprite.x = logicalWorldWidth() - 200;
  world.phase = "BATTLE";
  world.camX = 0;
  world.engaging = false;
  enemySprite.dead = false;
  playerSprite.x = 80;
  playerSprite.animState = "idle";
  playerSprite.frame = 0;
  playerSprite.frameTimer = 0;
  enemySprite.animState = "idle";
  enemySprite.frame = 0;
  enemySprite.frameTimer = 0;

  const qaOutcome = qaParams.get("outcome");
  if (qaOutcome === "reward") {
    setTimeout(() => callbacks.showRewardOverlay(), 0);
  } else if (qaOutcome === "victory" || qaOutcome === "defeat") {
    setGameOver(true);
    setTimeout(() => {
      callbacks.showEndOverlay(
        qaOutcome === "victory",
        qaOutcome === "victory"
          ? "You breached the mainframe and deleted the Firewall Daemon."
          : "The Firewall Daemon overwhelmed your system.",
      );
    }, 0);
  }
}

