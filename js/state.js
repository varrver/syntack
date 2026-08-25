/**
 * SYNTACK — Game State
 * Mutable player/enemy/run objects, enemy roster, and constants.
 */

export let player = {
  hp: 50,
  maxHp: 50,
  ram: 3,
  maxRam: 3,
  block: 0,
  varX: 0,
  loopMult: 1,
};

export let enemy = {
  hp: 60,
  maxHp: 60,
  attackDmg: 8,
  intent: "attack",
  name: "FIREWALL DAEMON",
};

export const ENEMY_ROSTER = [
  { name: "FIREWALL DAEMON", hp: 60, attackDmg: 8 },
  { name: "INTRUSION WRAITH", hp: 75, attackDmg: 10 },
  { name: "LOGIC BOMBER", hp: 90, attackDmg: 12 },
  { name: "MAINFRAME CORE", hp: 120, attackDmg: 14 },
];

export const BOSS_NODE = ENEMY_ROSTER.length;

// Per-run tallies shown on the end screen. Deck size isn't tracked here —
// it reads live from `deck`.
export function freshStats() {
  return { turns: 0, damageDealt: 0, cardsPlayed: 0 };
}

export let run = {
  node: 1,
  bestNode: (() => {
    try {
      return (
        parseInt(localStorage.getItem("syntack_best_node") || "0", 10) || 0
      );
    } catch {
      return 0;
    }
  })(),
  stats: freshStats(),
};

// Card ids the player owns — drawHand samples from this pool, card
// rewards append to it. Grows across the run.
export let deck = [];
export function setDeck(next) {
  deck = next;
}

export let world = {
  phase: "BATTLE", // "BATTLE" | "RUNNING" | "VICTORY"
  groundY: 210,
  // Camera offset: entities live in world coords, drawn at x - camX.
  // Advances under a screen-pinned runner during RUNNING; follows the
  // player during VICTORY; frozen during BATTLE.
  camX: 0,
  // World distance left to cover in the current node's approach run
  runRemaining: 0,
  // Approach scroll speed (px/s) — derived in loadEnemy from the node
  // distance so every run-in lands in ~1.6s regardless of node depth
  runSpeed: 0,
};

export let playerSprite = {
  x: 80,
  y: 135,
  width: 96,
  height: 96,
  animState: "idle", // "idle" | "walk" | "run" | "shoot" | "hurt"
  frame: 0,
  frameTimer: 0,
  shieldTimer: 0,
  muzzleFlashTimer: 0,
};

export let enemySprite = {
  x: 620,
  y: 95,
  width: 160,
  height: 160,
  animState: "idle", // "idle" | "run" | "attack" | "hurt" | "death"
  frame: 0,
  frameTimer: 0,
  opacity: 1,
  dead: false, // corpse stays on the field; player walks past it on win
};

export let projectiles = [];
export let particles = [];

// Canvas screen-shake state — mutated by combat.js, applied by renderer.js
export const screenShake = { t: 0, duration: 0, intensity: 0 };

export let hand = [];
export let isAnimating = false;
export let gameOver = false;
export let lastPlayRect = null;

export function setHand(value) { hand = value; }
export function setIsAnimating(value) { isAnimating = value; }
export function setGameOver(value) { gameOver = value; }
export function setLastPlayRect(value) { lastPlayRect = value; }
export function setWorldPhase(phase) { world.phase = phase; }

