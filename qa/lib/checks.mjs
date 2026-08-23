/**
 * SYNTACK QA — assertion library.
 *
 * Each suite is an array of `{ name, check(d), detail(d) }` entries that run
 * against a plain data object gathered from the page in a single
 * Runtime.evaluate (see the exported `*Data` template strings). This keeps
 * checks pure and fast — one round trip per suite instead of one per check.
 */

/* ── color ground truth (must match tailwind.config in index.html) ── */
export const CONFIG_HEX = {
  blue: '#009ddc',
  green: '#59d67a',
  red: '#fe5f55',
  yellow: '#f5c542',
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
export const RGBS = Object.fromEntries(
  Object.entries(CONFIG_HEX).map(([k, v]) => [k, hexToRgb(v)])
);

/* ── data gathering scripts (evaluated in the page) ── */

export const splashData = `(() => {
  const title = document.querySelector('#splash-screen h1.glitch');
  const btn = document.getElementById('btn-splash-start');
  return {
    glitch: !!title,
    glitchText: title ? title.getAttribute('data-text') : null,
    playBtn: !!btn,
    playHasSvg: btn ? !!btn.querySelector('svg') : false,
    scanlines: !!document.querySelector('.scanlines'),
  };
})()`;

export const homeData = `(() => {
  const menu = ['#btn-menu-start', '#btn-menu-archive', '#btn-menu-rules'];
  const menus = menu.map((s) => document.querySelector(s));
  return {
    display: getComputedStyle(document.getElementById('home-screen')).display,
    menuCount: menus.filter(Boolean).length,
    menuSvg: menus.filter((b) => b && b.querySelector('svg')).length,
    mute: !!document.getElementById('btnMuteHome'),
    vol: !!document.getElementById('volSliderHome'),
  };
})()`;

export const arenaData = `(() => {
  const gs = document.getElementById('game-screen');
  const style = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const hand = document.getElementById('hand-container');
  const cards = [...(hand ? hand.querySelectorAll('.card') : [])];
  const logs = [...document.querySelectorAll('#terminal .terminal-log')];
  const enemyIntent = document.getElementById('enemy-intent');
  return {
    screenDisplay: style(gs, 'display'),
    screenDirection: style(gs, 'flexDirection'),
    childCount: gs ? gs.children.length : 0,
    chipDisplays: document.querySelectorAll('.chip-display').length,
    hpTransform: style(document.getElementById('hpBarFill'), 'transform'),
    ramTransform: style(document.getElementById('ramBarFill'), 'transform'),
    enemyTransform: style(document.getElementById('enemyHpFill'), 'transform'),
    handOverflowX: style(hand, 'overflowX'),
    terminalLogs: logs.length,
    balatroClassLogs: logs.filter((l) => /text-balatro-/.test(l.className)).length,
    logColors: [...new Set(logs.map((l) => getComputedStyle(l).color))],
    cursor: !!document.querySelector('.terminal-cursor'),
    cursorAnim: style(document.querySelector('.terminal-cursor'), 'animationName'),
    handCount: cards.length,
    handTypeBars: cards.filter((c) => c.querySelector('.card-type-bar')).length,
    handRamBadges: cards.filter((c) => c.querySelector('.card-ram')).length,
    intentSvg: enemyIntent ? !!enemyIntent.querySelector('svg') : false,
    intentText: enemyIntent ? enemyIntent.textContent.trim() : '',
    enemyHp: (document.getElementById('enemy-hp') || {}).textContent || '',
    playerHp: (document.getElementById('player-hp') || {}).textContent || '',
    hud: {
      home: !!document.getElementById('btn-game-home'),
      mute: !!document.getElementById('btnMute'),
      vol: !!document.getElementById('volSlider'),
    },
    htmlScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    winW: window.innerWidth,
  };
})()`;

export const playCardData = `(() => {
  const logs = [...document.querySelectorAll('#terminal .terminal-log')].map((l) => l.textContent);
  const ram = (document.getElementById('ramDisplay') || {}).textContent || '';
  return {
    executed: logs.some((t) => t.includes('Execute')),
    ramText: ram,
    ramChanged: (() => {
      const cur = parseInt(ram.slice(ram.indexOf(':') + 1), 10);
      // Every card either costs RAM (1-2) or OVERCLOCK raises max to 5,
      // so a fresh 3/3 start always changes (never equals the initial 3).
      return Number.isFinite(cur) && cur !== 3;
    })(),
    handCount: document.querySelectorAll('#hand-container .card').length,
  };
})()`;

export const endTurnData = `(() => {
  const logs = [...document.querySelectorAll('#terminal .terminal-log')].map((l) => l.textContent);
  return {
    enemyLog: logs.some((t) => /ENEMY|DAMAGE|BLOCK/.test(t)),
    intentText: (document.getElementById('enemy-intent') || {}).textContent.trim() || '',
    enemyHp: (document.getElementById('enemy-hp') || {}).textContent || '',
    playerHp: (document.getElementById('player-hp') || {}).textContent || '',
    handCount: document.querySelectorAll('#hand-container .card').length,
  };
})()`;

export const modalData = `(() => {
  const d = (el) => (el ? getComputedStyle(el).display : 'none');
  return {
    archiveDisplay: d(document.getElementById('archive-modal')),
    archiveCards: document.querySelectorAll('#archive-cards-list .card').length,
    rulesDisplay: d(document.getElementById('rules-modal')),
    activeId: document.activeElement ? document.activeElement.id : '',
  };
})()`;

export const intentData = `(() => {
  const el = document.getElementById('enemy-intent');
  return {
    intentSvg: el ? !!el.querySelector('svg') : false,
    intentText: el ? el.textContent.trim() : '',
    enemyHp: (document.getElementById('enemy-hp') || {}).textContent || '',
  };
})()`;

export const endOverlayData = `(() => {
  const ov = document.getElementById('end-overlay');
  const title = document.getElementById('end-overlay-title');
  const chip = document.getElementById('end-overlay-chip');
  return {
    display: ov ? getComputedStyle(ov).display : 'none',
    zIndex: ov ? getComputedStyle(ov).zIndex : null,
    title: title ? title.textContent : '',
    dataText: title ? title.getAttribute('data-text') : '',
    chip: chip ? chip.textContent : '',
    focused: document.activeElement ? document.activeElement.id : '',
  };
})()`;

export const rewardData = `(() => {
  const ov = document.getElementById('reward-overlay');
  const ids = ['#btn-reward-heal', '#btn-reward-ram', '#btn-reward-hp'];
  return {
    display: ov ? getComputedStyle(ov).display : 'none',
    zIndex: ov ? getComputedStyle(ov).zIndex : null,
    buttons: ids.filter((s) => document.querySelector(s)).length,
    labelled: !!document.getElementById('reward-title'),
    focused: document.activeElement ? document.activeElement.id : '',
    focusedDisabled: !!(document.activeElement && document.activeElement.disabled),
    healDisabled: !!document.getElementById('btn-reward-heal')?.disabled,
  };
})()`;

export const nodeData = `(() => {
  const nameEl = document.getElementById('enemy-name');
  const nodeEl = document.getElementById('node-indicator');
  const bestEl = document.getElementById('best-run-line');
  const hp = document.getElementById('enemy-hp');
  return {
    name: nameEl ? nameEl.textContent : '',
    node: nodeEl ? nodeEl.textContent : '',
    best: bestEl ? bestEl.textContent : '',
    hp: hp ? hp.textContent : '',
  };
})()`;

export const reducedMotionData = `(() => {
  const log = document.querySelector('.terminal-log');
  const cursor = document.querySelector('.terminal-cursor');
  return {
    animDuration: log ? getComputedStyle(log).animationDuration : null,
    cursorAnim: cursor ? getComputedStyle(cursor).animationName : null,
  };
})()`;

/* ── suite runner ── */

export function runSuite(suite, d) {
  return suite.map(({ name, check, detail = () => '' }) => {
    try {
      const pass = check(d);
      return { name, pass: !!pass, detail: detail(d) };
    } catch (e) {
      return { name, pass: false, detail: `check threw: ${e.message}` };
    }
  });
}

/* ── check suites (spec §6.5) ── */

export const ARENA_SUITE = [
  {
    name: 'A1-game-screen-display-flex',
    check: (d) => d.screenDisplay === 'flex',
    detail: (d) => `display=${d.screenDisplay}`,
  },
  {
    name: 'A2-game-screen-flex-direction-column',
    check: (d) => d.screenDirection === 'column',
    detail: (d) => `flex-direction=${d.screenDirection}`,
  },
  {
    name: 'A3-five-arena-sections',
    check: (d) => d.childCount === 5,
    detail: (d) => `children=${d.childCount}`,
  },
  {
    name: 'A4-no-document-horizontal-overflow',
    check: (d) => d.htmlScrollW <= d.winW + 1 || d.bodyScrollW <= d.winW + 1,
    detail: (d) => `html=${d.htmlScrollW}/${d.winW}px body=${d.bodyScrollW}/${d.winW}px`,
  },
  {
    name: 'A4b-hand-container-scrolls-internally',
    check: (d) => d.handOverflowX === 'auto',
    detail: (d) => `overflow-x=${d.handOverflowX}`,
  },
  {
    name: 'A5-four-chip-displays',
    check: (d) => d.chipDisplays === 4,
    detail: (d) => `count=${d.chipDisplays}`,
  },
  {
    name: 'A5b-chip-bar-fills-transform-based',
    check: (d) =>
      !!d.hpTransform && !!d.ramTransform && !!d.enemyTransform && d.hpTransform.includes('matrix'),
    detail: (d) => `hp=${d.hpTransform} ram=${d.ramTransform} enemy=${d.enemyTransform}`,
  },
  {
    name: 'A6-terminal-log-colors',
    check: (d) =>
      d.terminalLogs >= 1 &&
      d.balatroClassLogs >= 1 &&
      d.logColors.some((c) => Object.values(RGBS).includes(c)),
    detail: (d) =>
      `logs=${d.terminalLogs} balatro=${d.balatroClassLogs} colors=[${d.logColors.join(', ')}]`,
  },
  {
    name: 'A7-terminal-cursor-blinks',
    check: (d) => d.cursor && /cursorBlink/.test(d.cursorAnim || ''),
    detail: (d) => `cursor=${d.cursor} animationName=${d.cursorAnim}`,
  },
  {
    name: 'A8-hand-four-cards-typebars-ram',
    check: (d) => d.handCount === 4 && d.handTypeBars === 4 && d.handRamBadges === 4,
    detail: (d) => `cards=${d.handCount} typeBars=${d.handTypeBars} ramBadges=${d.handRamBadges}`,
  },
  {
    name: 'A9-intent-box-icon-and-label',
    check: (d) => d.intentSvg && /ATTACK|DEFENSE|BUFF/.test(d.intentText),
    detail: (d) => `svg=${d.intentSvg} text="${d.intentText}"`,
  },
  {
    name: 'A12-hud-controls-present',
    check: (d) => d.hud.home && d.hud.mute && d.hud.vol,
    detail: (d) => JSON.stringify(d.hud),
  },
];

export const SPLASH_SUITE = [
  {
    name: 'S1-glitch-title',
    check: (d) => d.glitch && d.glitchText === 'SYNTACK',
    detail: (d) => `glitch=${d.glitch} data-text=${d.glitchText}`,
  },
  {
    name: 'S2-play-button-has-svg-icon',
    check: (d) => d.playBtn && d.playHasSvg,
    detail: (d) => `button=${d.playBtn} svg=${d.playHasSvg}`,
  },
  { name: 'S3-scanlines-layer', check: (d) => d.scanlines, detail: (d) => `present=${d.scanlines}` },
];

export const HOME_SUITE = [
  {
    name: 'H1-home-screen-visible',
    check: (d) => d.display === 'flex',
    detail: (d) => `display=${d.display}`,
  },
  {
    name: 'H2-three-menu-buttons-with-svg',
    check: (d) => d.menuCount === 3 && d.menuSvg === 3,
    detail: (d) => `buttons=${d.menuCount} svg=${d.menuSvg}`,
  },
  {
    name: 'H3-audio-controls-present',
    check: (d) => d.mute && d.vol,
    detail: (d) => `mute=${d.mute} vol=${d.vol}`,
  },
];

export const PLAY_CARD_SUITE = [
  {
    name: 'P1-ram-state-changed',
    check: (d) => d.ramChanged,
    detail: (d) => `ram="${d.ramText}"`,
  },
  {
    name: 'P2-terminal-execute-log',
    check: (d) => d.executed,
    detail: (d) => `executed=${d.executed}`,
  },
  {
    name: 'P3-hand-reduced-by-one',
    check: (d) => d.handCount === 4,
    detail: (d) => `cards=${d.handCount}`,
  },
];

export const END_TURN_SUITE = [
  {
    name: 'E1-enemy-intent-updated',
    check: (d) => /ATTACK|DEFENSE|BUFF/.test(d.intentText),
    detail: (d) => `intent="${d.intentText}"`,
  },
  {
    name: 'E2-enemy-turn-logged',
    check: (d) => d.enemyLog,
    detail: (d) => `logged=${d.enemyLog}`,
  },
  {
    name: 'E3-hp-values-consistent',
    check: (d) => /^\d+\/60$/.test(d.enemyHp) && /^\d+\/50$/.test(d.playerHp),
    detail: (d) => `enemy=${d.enemyHp} player=${d.playerHp}`,
  },
  {
    name: 'E4-hand-refilled-to-four',
    check: (d) => d.handCount === 4,
    detail: (d) => `cards=${d.handCount}`,
  },
];

export const MODAL_SUITE = [
  {
    name: 'M1-archive-modal-opens-with-full-grid',
    check: (d) => d.archiveDisplay === 'flex' && d.archiveCards === 10,
    detail: (d) => `display=${d.archiveDisplay} cards=${d.archiveCards}`,
  },
  {
    name: 'M2-escape-closes-and-restores-focus',
    check: (d) => d.afterEscapeDisplay === 'none' && d.afterEscapeActive === 'btn-menu-archive',
    detail: (d) => `display=${d.afterEscapeDisplay} active=${d.afterEscapeActive}`,
  },
  {
    name: 'M3-rules-modal-open-close-via-x',
    check: (d) => d.rulesOpened === 'flex' && d.rulesClosed === 'none' && d.afterCloseActive === 'btn-menu-rules',
    detail: (d) => `opened=${d.rulesOpened} closed=${d.rulesClosed} active=${d.afterCloseActive}`,
  },
];

export const INTENT_SUITE = [
  {
    name: 'I1-intent-icon-present',
    check: (d) => d.intentSvg,
    detail: (d) => `svg=${d.intentSvg}`,
  },
  {
    name: 'I2-intent-label-matches-state',
    check: (d) => d.expected.test(d.intentText),
    detail: (d) => `"${d.intentText}" expected ~${d.expected}`,
  },
];

export const REWARD_SUITE = [
  {
    name: 'R1-reward-overlay-visible',
    check: (d) => d.display === 'flex' && Number(d.zIndex) === 200,
    detail: (d) => `display=${d.display} z=${d.zIndex}`,
  },
  {
    name: 'R2-three-reward-options-labelled',
    check: (d) => d.buttons === 3 && d.labelled,
    detail: (d) => `buttons=${d.buttons} labelled=${d.labelled}`,
  },
  {
    name: 'R3-first-enabled-reward-focused',
    check: (d) =>
      ['btn-reward-heal', 'btn-reward-ram', 'btn-reward-hp'].includes(d.focused) && !d.focusedDisabled,
    detail: (d) => `active=${d.focused} disabled=${d.focusedDisabled}`,
  },
  {
    name: 'R4-repair-disabled-at-full-hp',
    check: (d) => d.healDisabled === true,
    detail: (d) => `healDisabled=${d.healDisabled}`,
  },
];

export const NODE_SUITE = [
  {
    name: 'N1-enemy-name-matches-roster',
    check: (d) => d.name.includes(d.expectedName),
    detail: (d) => `name="${d.name}" expected "${d.expectedName}"`,
  },
  {
    name: 'N2-node-indicator-shows-position',
    check: (d) => d.node.includes(`${d.expectedNode}/4`) && d.best.includes(`${d.expectedNode}/4`),
    detail: (d) => `node="${d.node}" best="${d.best}"`,
  },
  {
    name: 'N3-enemy-hp-matches-roster',
    check: (d) => d.hp.startsWith(`${d.expectedHp}/`),
    detail: (d) => `hp="${d.hp}" expected ${d.expectedHp}`,
  },
];

export const END_OVERLAY_SUITE = [
  {
    name: 'O1-overlay-visible-topmost',
    check: (d) => d.display === 'flex' && Number(d.zIndex) === 300,
    detail: (d) => `display=${d.display} z=${d.zIndex}`,
  },
  {
    name: 'O2-title-chip-and-data-text',
    check: (d) =>
      d.title === d.expectedTitle && d.dataText === d.expectedTitle && d.chip === d.expectedChip,
    detail: (d) =>
      `title="${d.title}" data-text="${d.dataText}" chip="${d.chip}" expected title="${d.expectedTitle}"`,
  },
  {
    name: 'O3-run-again-button-focused',
    check: (d) => d.focused === 'btn-end-again',
    detail: (d) => `active=${d.focused}`,
  },
];

export const REDUCED_MOTION_SUITE = [
  {
    name: 'R1-css-animations-effectively-disabled',
    check: (d) => {
      const n = parseFloat(d.animDuration || '1');
      return Number.isFinite(n) && n < 0.01;
    },
    detail: (d) => `terminal-log animation-duration=${d.animDuration}`,
  },
];
