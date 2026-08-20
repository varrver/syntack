/**
 * SYNTACK — Card Definitions
 * All 10 card types with their action functions.
 * Actions mutate player/enemy state and trigger animations.
 */

import { player, enemy } from "./state.js";
import { dealDamageToEnemy } from "./combat.js";
import { animateFloatDamage } from "./motion.js";
import { log } from "./renderer.js";

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
      log("Variable 'x' set to 8.", "player");
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
    action: () => {
      let base = player.varX > 0 ? player.varX : 4;
      let total = base * player.loopMult;
      dealDamageToEnemy(total);
      log(`EXECUTE ATTACK(${total})!`, "player");
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
        log("IF (x > 5) → TRUE! Block +10, x +4", "player");
        animateFloatDamage("+10 Block", "block", "30%", "55%");
        animateFloatDamage("x +4", "buff", "55%", "55%");
      } else {
        log("IF (x > 5) → FALSE. No effect.", "warning");
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
      log("FOR LOOP ACTIVE! Next attack 2x dmg!", "player");
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
      log("DEFENSE(8) → Block +8", "player");
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
      log(`Variable x doubled → x = ${player.varX}`, "player");
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
        log(`OVERCLOCK! Max RAM ↑ ${player.maxRam}`, "player");
        animateFloatDamage("RAM +2", "heal", "40%", "50%");
      } else {
        log("OVERCLOCK: RAM already at max.", "warning");
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
    action: () => {
      let dmg = Math.min(12, player.block);
      if (dmg > 0) {
        dealDamageToEnemy(dmg);
        log(`PURGE! Converted block → ${dmg} dmg`, "player");
      } else {
        log("PURGE: no block to convert.", "warning");
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
        log(`REBOOT! HP +${healed}`, "player");
        animateFloatDamage(`+${healed} HP`, "heal", "40%", "55%");
      } else {
        log("REBOOT: HP already full.", "warning");
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
      log("PARALLEL THREAD! Next attack 3x dmg!", "player");
      animateFloatDamage("3x DMG!", "buff", "45%", "50%");
    },
  },
];
  {
    id: 8,
    ram: 1,
    code: "PURGE()",
    desc: "Deal dmg = Block (max 12)",
    rarity: "rare",
    type: "attack",
    action: () => {
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
