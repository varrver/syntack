/**
 * SYNTACK — Card Definitions
 * All 10 card types with their action functions.
 * Actions mutate player/enemy state and trigger animations.
 */

import { player, enemy } from "./state.js";
import { animateFloatDamage } from "./motion.js";

export const CARD_TYPES = [
  {
    id: 1,
    ram: 1,
    code: "let x = 8;",
    desc: "Set Variable x = 8",
    rarity: "common",
    type: "variable",
    action: () => {
      player.varX = 8;
      animateFloatDamage("x = 8", "buff", "35%", "60%");
    },
  },
  {
    id: 2,
    ram: 1,
    code: "ATTACK(x)",
    desc: "Deal dmg = x (Default: 4)",
    rarity: "common",
    type: "attack",
    action: (dealDamageToEnemy) => {
      let base = player.varX > 0 ? player.varX : 4;
      let total = base * player.loopMult;
      dealDamageToEnemy(total);
      player.loopMult = 1;
    },
  },
  {
    id: 3,
    ram: 1,
    code: "if (x > 5)",
    desc: "If x > 5: +10 Block, +4 ATK",
    rarity: "rare",
    type: "variable",
    action: () => {
      if (player.varX > 5) {
        player.block += 10;
        player.varX += 4;
        animateFloatDamage("+10 Block", "block", "30%", "55%");
        animateFloatDamage("x +4", "buff", "55%", "55%");
      }
    },
  },
  {
    id: 4,
    ram: 2,
    code: "for (2x Loop)",
    desc: "Double next attack damage!",
    rarity: "epic",
    type: "loop",
    action: () => {
      player.loopMult *= 2;
      animateFloatDamage("2x DMG!", "buff", "45%", "50%");
    },
  },
  {
    id: 5,
    ram: 1,
    code: "DEFENSE(8)",
    desc: "Gain +8 Block",
    rarity: "common",
    type: "defense",
    action: () => {
      player.block += 8;
      animateFloatDamage("+8 Block", "block", "40%", "60%");
    },
  },
  {
    id: 6,
    ram: 1,
    code: "x *= 2",
    desc: "Double Variable x",
    rarity: "rare",
    type: "variable",
    action: () => {
      player.varX *= 2;
      animateFloatDamage("x ×2", "buff", "35%", "55%");
    },
  },
  {
    id: 7,
    ram: 2,
    code: "OVERCLOCK()",
    desc: "Gain +2 RAM (max 5)",
    rarity: "epic",
    type: "defense",
    action: () => {
      let gained = Math.min(2, 5 - player.maxRam);
      if (gained > 0) {
        player.maxRam += gained;
        player.ram = player.maxRam;
        animateFloatDamage("RAM +2", "heal", "40%", "50%");
      }
    },
  },
  {
    id: 8,
    ram: 1,
    code: "PURGE()",
    desc: "Deal dmg = Block (max 12)",
    rarity: "rare",
    type: "attack",
    action: (dealDamageToEnemy) => {
      let dmg = Math.min(12, player.block);
      if (dmg > 0) {
        dealDamageToEnemy(dmg);
      }
    },
  },
  {
    id: 9,
    ram: 1,
    code: "REBOOT()",
    desc: "Heal +6 HP",
    rarity: "common",
    type: "defense",
    action: () => {
      const healed = Math.min(player.maxHp - player.hp, 6);
      if (healed > 0) {
        player.hp += healed;
        animateFloatDamage(`+${healed} HP`, "heal", "40%", "55%");
      }
    },
  },
  {
    id: 10,
    ram: 2,
    code: "PARALLEL()",
    desc: "Next attack 3x dmg",
    rarity: "epic",
    type: "loop",
    action: () => {
      player.loopMult *= 3;
      animateFloatDamage("3x DMG!", "buff", "45%", "50%");
    },
  },
];
