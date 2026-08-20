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
};

export let hand = [];
export let isAnimating = false;
export let gameOver = false;
export let lastPlayRect = null;

export function setHand(value) { hand = value; }
export function setIsAnimating(value) { isAnimating = value; }
export function setGameOver(value) { gameOver = value; }
export function setLastPlayRect(value) { lastPlayRect = value; }
