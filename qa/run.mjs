#!/usr/bin/env node
/**
 * SYNTACK QA harness — Phase 1 (see visual-check-spec.md).
 *
 * Zero-dependency CDP visual check: drives headless Chrome over the DevTools
 * Protocol using Node's built-in WebSocket, clicks through the full game,
 * runs the assertion suites, captures screenshots + console/network events,
 * and writes terminal / JSON / Markdown reports.
 *
 * Usage:
 *   node qa/run.mjs [--server http://localhost:8123] [--viewports desktop,tablet,mobile,landscape]
 *                   [--seeds 1,42,1337] [--out qa/reports] [--no-screens] [--verbose]
 */
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { launchChrome, CDP, pickPort, sleep, urlWith, killChrome } from './lib/cdp.mjs';
import {
  runSuite,
  RGBS,
  ARENA_SUITE,
  SPLASH_SUITE,
  HOME_SUITE,
  PLAY_CARD_SUITE,
  END_TURN_SUITE,
  MODAL_SUITE,
  INTENT_SUITE,
  END_OVERLAY_SUITE,
  REDUCED_MOTION_SUITE,
  REWARD_SUITE,
  NODE_SUITE,
  splashData,
  homeData,
  arenaData,
  playCardData,
  endTurnData,
  modalData,
  intentData,
  endOverlayData,
  rewardData,
  nodeData,
  reducedMotionData,
} from './lib/checks.mjs';
import { buildReport, terminalSummary, writeJson, writeMarkdown } from './lib/report.mjs';

/* ── viewport matrix (spec §6.3) ── */
const VIEWPORTS = [
  { key: 'desktop', width: 1280, height: 800 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'mobile', width: 375, height: 667 },
  { key: 'landscape', width: 812, height: 375 },
];

/* ── CLI ── */
function parseArgs(argv) {
  const args = { server: 'http://localhost:8123', viewports: null, seeds: '1,42,1337', out: 'qa/reports', noScreens: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case '--server': args.server = val; break;
      case '--viewports': args.viewports = val.split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--seeds': args.seeds = val; break;
      case '--out': args.out = val; break;
      case '--no-screens': args.noScreens = true; i--; break;
      case '--verbose': args.verbose = true; i--; break;
      case '--help':
        console.log(`SYNTACK QA harness (Phase 1)\n\n` +
          `  --server <url>       base URL (default http://localhost:8123)\n` +
          `  --viewports <csv>    desktop,tablet,mobile,landscape\n` +
          `  --seeds <csv>        RNG seeds, e.g. 1,42,1337\n` +
          `  --out <dir>          report output dir (default qa/reports)\n` +
          `  --no-screens         skip forced-state scenarios and screenshots\n` +
          `  --verbose            print failed-check and console detail\n`);
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${key}`);
    }
  }
  if (!args.viewports) args.viewports = VIEWPORTS.map((v) => v.key);
  return args;
}

/** Kill Chrome and remove the temp profile on abnormal process termination. */
function registerCleanup(proc, userDataDir) {
  const cleanup = () => {
    try {
      killChrome(proc);
    } catch {}
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}

function reachable(url) {
  return fetch(url, { method: 'HEAD' }).then(
    (r) => r.ok,
    () => fetch(url).then((r) => r.ok, () => false)
  );
}

/* ── console/network capture + classification (spec §6.6) ── */
const CDN_RE = /cdn\.(jsdelivr|tailwindcss)\./;

function classifyEvent(e) {
  if (e.kind === 'exception') {
    return { severity: 'FAIL', message: `uncaught exception: ${e.text}` };
  }
  if (e.kind === 'console') {
    if (e.type === 'error') return { severity: 'FAIL', message: e.text };
    if (e.type === 'warning') return { severity: 'WARN', message: e.text };
    return { severity: 'INFO', message: e.text };
  }
  if (e.kind === 'http') {
    if (/favicon/i.test(e.url)) return { severity: 'WARN', message: `HTTP ${e.status} (favicon noise): ${e.url}` };
    if (CDN_RE.test(e.url)) return { severity: 'ENV', message: `HTTP ${e.status}: ${e.url}` };
    return { severity: 'FAIL', message: `HTTP ${e.status}: ${e.url}` };
  }
  if (e.kind === 'net') {
    if (e.error === 'net::ERR_ABORTED') return { severity: 'IGNORE', message: `${e.error}: ${e.url}` };
    if (CDN_RE.test(e.url)) return { severity: 'ENV', message: `${e.error}: ${e.url}` };
    if (/favicon/i.test(e.url)) return { severity: 'WARN', message: `${e.error} (favicon): ${e.url}` };
    if (/Autoplay|NotAllowedError|user gesture/i.test(e.error)) return { severity: 'WARN', message: `${e.error}: ${e.url}` };
    return { severity: 'FAIL', message: `${e.error}: ${e.url}` };
  }
  return { severity: 'INFO', message: JSON.stringify(e) };
}

function attachCapture(cdp) {
  const events = [];
  const urlById = new Map();
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    events.push({ kind: 'console', type: p.type, text });
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    events.push({ kind: 'exception', text: (d.exception && d.exception.description) || d.text });
  });
  cdp.on('Network.requestWillBeSent', (p) => {
    urlById.set(p.requestId, p.request.url);
  });
  cdp.on('Network.responseReceived', (p) => {
    const status = p.response && p.response.status;
    if (status >= 400) {
      events.push({ kind: 'http', status, url: p.response.url });
    }
  });
  cdp.on('Network.loadingFailed', (p) => {
    const url = urlById.get(p.requestId) || '';
    if (url && url.startsWith('data:')) return;
    events.push({ kind: 'net', error: p.errorText || 'net::ERR_FAILED', url });
  });
  return events;
}

/* ── scenario helpers ── */
async function enterArena(page) {
  await page.click('#btn-splash-start');
  await page.waitFor(`getComputedStyle(document.getElementById('home-screen')).display === 'flex'`);
  await page.click('#btn-menu-start');
  await page.waitFor(`getComputedStyle(document.getElementById('lobby-screen')).display === 'flex'`);
  await page.click('#btn-breach-node');
  await page.waitFor(
    `getComputedStyle(document.getElementById('game-screen')).display === 'flex' && ` +
      `document.querySelectorAll('#hand-container .card').length > 0`
  );
}

/**
 * The Tailwind Play CDN applies its config-color utilities (text-balatro-*)
 * asynchronously after each load, so a freshly rendered terminal log can
 * briefly inherit the body color. Wait until a terminal log actually computes
 * to one of the expected palette colors before asserting (observed to take
 * ~500ms in warmed sessions). Palette is derived from checks.mjs RGBS so the
 * ground truth lives in one place.
 */
async function waitForBalatroRules(page) {
  const palette = Object.values(RGBS).map((c) => `'${c}'`).join(', ');
  await page.waitFor(
    `(() => {
       const l = document.querySelector('#terminal .terminal-log');
       return !!l && [${palette}].includes(getComputedStyle(l).color);
     })()`,
    8000
  );
}

async function startFresh(page, url) {
  try {
    await page.eval('localStorage.clear(); true');
  } catch {}
  await page.navigate(url);
}

/* ── scenarios ── */
async function runSplash(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  await startFresh(page, server);
  await page.waitFor(`!!document.getElementById('btn-splash-start')`);
  const d = await page.eval(splashData);
  const shot = `splash-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks: runSuite(SPLASH_SUITE, d), screenshots: [shot] };
}

async function runHome(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  await startFresh(page, server);
  await page.click('#btn-splash-start');
  await page.waitFor(`getComputedStyle(document.getElementById('home-screen')).display === 'flex'`);
  const d = await page.eval(homeData);
  const shot = `home-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks: runSuite(HOME_SUITE, d), screenshots: [shot] };
}

async function runArena(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  await startFresh(page, urlWith(server, { seed }));
  await enterArena(page);
  await waitForBalatroRules(page);
  const d = await page.eval(arenaData);
  const shot = `arena-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks: runSuite(ARENA_SUITE, d), screenshots: [shot] };
}

async function runPlayCard(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  // screen=arena snaps straight to BATTLE — cards are inert during the
  // RUNNING approach (see playCard guard), so skip the walk-in
  await startFresh(page, urlWith(server, { seed, test: 1, screen: 'arena' }));
  await page.waitFor(
    `getComputedStyle(document.getElementById('game-screen')).display === 'flex' && ` +
      `document.querySelectorAll('#hand-container .card').length > 0`,
    15000
  );
  const before = await page.eval(`document.querySelectorAll('#hand-container .card').length`);
  await page.click('#hand-container .card');
  await page.waitFor(`document.querySelectorAll('#hand-container .card').length === ${before - 1}`, 8000);
  const d = await page.eval(playCardData);
  const shot = `play-card-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks: runSuite(PLAY_CARD_SUITE, d), screenshots: [shot] };
}

async function runEndTurn(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  // screen=arena snaps straight to BATTLE — end-turn is inert during the
  // RUNNING approach (see endTurnHandler guard), so skip the walk-in
  await startFresh(page, urlWith(server, { seed, test: 1, screen: 'arena' }));
  await page.waitFor(
    `getComputedStyle(document.getElementById('game-screen')).display === 'flex' && ` +
      `document.querySelectorAll('#hand-container .card').length > 0`,
    15000
  );
  await page.click('#btn-end-turn');
  await page.waitFor(
    `[...document.querySelectorAll('#terminal .terminal-log')].some(t => /ENEMY|DAMAGE|BLOCK/.test(t.textContent))`,
    8000
  );
  await sleep(600); // let the hand redraw + UI settle
  const d = await page.eval(endTurnData);
  const shot = `end-turn-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks: runSuite(END_TURN_SUITE, d), screenshots: [shot] };
}

async function runModals(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  await startFresh(page, urlWith(server, { seed }));
  await enterArena(page);
  await page.click('#btn-game-home');
  await page.waitFor(`getComputedStyle(document.getElementById('home-screen')).display === 'flex'`);

  // open archive
  await page.click('#btn-menu-archive');
  await page.waitFor(`getComputedStyle(document.getElementById('archive-modal')).display === 'flex'`);
  const opened = await page.eval(modalData);

  // close via Escape, expect focus restored to the archive button
  await page.key('Escape', 'Escape', 27);
  await page.waitFor(`getComputedStyle(document.getElementById('archive-modal')).display === 'none'`);
  const afterEscape = await page.eval(modalData);

  // open rules, close via X button
  await page.click('#btn-menu-rules');
  await page.waitFor(`getComputedStyle(document.getElementById('rules-modal')).display === 'flex'`);
  const rulesOpen = await page.eval(modalData);
  await page.click('#btn-close-rules');
  await page.waitFor(`getComputedStyle(document.getElementById('rules-modal')).display === 'none'`);
  const afterRules = await page.eval(modalData);

  const d = {
    archiveDisplay: opened.archiveDisplay,
    archiveCards: opened.archiveCards,
    afterEscapeDisplay: afterEscape.archiveDisplay,
    afterEscapeActive: afterEscape.activeId,
    rulesOpened: rulesOpen.rulesDisplay,
    rulesClosed: afterRules.rulesDisplay,
    afterCloseActive: afterRules.activeId,
  };
  const shot = `modals-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks: runSuite(MODAL_SUITE, d), screenshots: [shot] };
}

async function runReducedMotion(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  await page.setReducedMotion('reduce');
  try {
    await startFresh(page, urlWith(server, { seed }));
    await enterArena(page);
    await waitForBalatroRules(page);
    const d = await page.eval(arenaData);
    const rm = await page.eval(reducedMotionData);
    const suite = [...ARENA_SUITE, ...REDUCED_MOTION_SUITE];
    const checks = runSuite(suite, { ...d, ...rm });
    const shot = `reduced-motion-${vp.key}-s${seed}.png`;
    if (shots) await page.screenshot(join(shots, shot));
    return { checks, screenshots: [shot] };
  } finally {
    await page.setReducedMotion('no-preference');
  }
}

/* ── hook-dependent scenarios (Phase 2 gate — skipped until ?test= exists) ── */
const INTENT_EXPECT = {
  attack: /ATTACK|DEFEND|BUFF \d+/,
  defend: /ATTACK|DEFEND|BUFF/,
  buff: /ATTACK|DEFEND|BUFF/,
};

async function runIntents(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  const checks = [];
  const screenshots = [];
  for (const intent of Object.keys(INTENT_EXPECT)) {
    await startFresh(page, urlWith(server, { test: 1, screen: 'arena', seed, intent }));
    await page.waitFor(
      `getComputedStyle(document.getElementById('game-screen')).display === 'flex' && ` +
        `!!document.getElementById('enemy-intent')`,
      15000
    );
    try {
      await page.waitFor(
        `/ATTACK|DEFEND|BUFF/.test((document.getElementById('enemy-intent')||{}).textContent||'')`,
        8000
      );
    } catch (err) {
      // Augment the timeout with live page state so failures are debuggable
      const state = await page
        .eval(`(() => ({
          intentText: (document.getElementById('enemy-intent') || {}).textContent || null,
          qaHook: !!window.__qa,
          readyState: document.readyState,
          url: location.href,
        }))()`)
        .catch((e) => ({ diagError: e.message }));
      throw new Error(`${err.message} — page state: ${JSON.stringify(state)}`);
    }
    const d = await page.eval(intentData);
    d.expected = INTENT_EXPECT[intent];
    checks.push(...runSuite(INTENT_SUITE, d).map((c) => ({ ...c, name: `${intent}-${c.name}` })));
    const shot = `intents-${intent}-${vp.key}-s${seed}.png`;
    if (shots) await page.screenshot(join(shots, shot));
    screenshots.push(shot);
  }
  return { checks, screenshots };
}

async function runEndOverlay(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  const checks = [];
  const screenshots = [];
  const variants = [
    { outcome: 'victory', expectedTitle: 'VICTORY', expectedChip: 'HACK COMPLETE' },
    { outcome: 'defeat', expectedTitle: 'SYSTEM FAILURE', expectedChip: 'CONNECTION LOST' },
  ];
  for (const v of variants) {
    await startFresh(page, urlWith(server, { test: 1, screen: 'arena', seed, outcome: v.outcome }));
    await page.waitFor(
      `(() => { const o = document.getElementById('end-overlay'); return o && getComputedStyle(o).display === 'flex'; })()`,
      15000
    );
    await sleep(400); // focus lands on RUN AGAIN after ~50ms
    const d = await page.eval(endOverlayData);
    d.expectedTitle = v.expectedTitle;
    d.expectedChip = v.expectedChip;
    checks.push(...runSuite(END_OVERLAY_SUITE, d).map((c) => ({ ...c, name: `${v.outcome}-${c.name}` })));
    const shot = `end-overlay-${v.outcome}-${vp.key}-s${seed}.png`;
    if (shots) await page.screenshot(join(shots, shot));
    screenshots.push(shot);
  }
  return { checks, screenshots };
}

/* Reward overlay between node clears (?test=1&outcome=reward). */
async function runReward(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  await startFresh(page, urlWith(server, { test: 1, screen: 'arena', seed, outcome: 'reward' }));
  await page.waitFor(`getComputedStyle(document.getElementById('reward-overlay')).display === 'flex'`, 15000);
  await sleep(150); // focus lands on the first reward after ~50ms
  const d = await page.eval(rewardData);
  const checks = runSuite(REWARD_SUITE, d);
  const shot = `reward-${vp.key}-s${seed}.png`;
  if (shots) await page.screenshot(join(shots, shot));
  return { checks, screenshots: [shot] };
}

/* Every roster entry renders with the right name / node / HP (?test=1&node=n). */
const NODES = [
  { node: 1, name: 'FIREWALL DAEMON', hp: 60 },
  { node: 2, name: 'INTRUSION WRAITH', hp: 75 },
  { node: 3, name: 'LOGIC BOMBER', hp: 90 },
  { node: 4, name: 'MAINFRAME CORE', hp: 120 },
];

async function runNodes(ctx) {
  const { page, shots, vp, seed, server } = ctx;
  const checks = [];
  const screenshots = [];
  for (const n of NODES) {
    await startFresh(page, urlWith(server, { test: 1, screen: 'arena', seed, node: n.node }));
    await page.waitFor(`getComputedStyle(document.getElementById('game-screen')).display === 'flex'`, 15000);
    const d = await page.eval(nodeData);
    d.expectedName = n.name;
    d.expectedNode = n.node;
    d.expectedHp = n.hp;
    checks.push(...runSuite(NODE_SUITE, d).map((c) => ({ ...c, name: `node${n.node}-${c.name}` })));
    const shot = `node-${n.node}-${vp.key}-s${seed}.png`;
    if (shots) await page.screenshot(join(shots, shot));
    screenshots.push(shot);
  }
  return { checks, screenshots };
}

const SCENARIOS = [
  { name: 'splash', hook: false, run: runSplash },
  { name: 'home', hook: false, run: runHome },
  { name: 'arena', hook: false, run: runArena },
  { name: 'play-card', hook: false, run: runPlayCard },
  { name: 'end-turn', hook: false, run: runEndTurn },
  { name: 'modals', hook: false, run: runModals },
  { name: 'reduced-motion', hook: false, run: runReducedMotion },
  { name: 'intents', hook: true, run: runIntents },
  { name: 'end-overlay', hook: true, run: runEndOverlay },
  { name: 'reward', hook: true, run: runReward },
  { name: 'nodes', hook: true, run: runNodes },
];

function skippedScenario(sc, vp, seed, reason) {
  return {
    name: sc.name,
    viewport: vp.key,
    viewportWidth: vp.width,
    viewportHeight: vp.height,
    seed,
    checks: [{ name: 'HOOK-REQUIRED', skipped: true, pass: false, detail: reason }],
    console: [],
    screenshots: [],
    status: 'SKIP',
  };
}

/* ── main ── */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const viewports = VIEWPORTS.filter((v) => args.viewports.includes(v.key));
  if (!viewports.length) throw new Error(`No valid viewports in: ${args.viewports}`);
  const seeds = args.seeds.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
  if (!seeds.length) throw new Error(`No valid seeds in: ${args.seeds}`);

  const outDir = args.out;
  const shotsDir = join(outDir, '..', 'screenshots');
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  console.error(`[qa] server: ${args.server}`);
  console.error(`[qa] viewports: ${viewports.map((v) => v.key).join(', ')}  seeds: ${seeds.join(', ')}`);
  if (!(await reachable(args.server + '/index.html'))) {
    throw new Error(
      `Server not reachable at ${args.server}. Start it with:\n  python3 -m http.server 8123\n(from the project root)`
    );
  }

  const port = await pickPort();
  const userDataDir = mkdtempSync(join(tmpdir(), 'syntack-qa-'));
  let proc = null;
  let page = null;
  const startedAt = Date.now();

  try {
    const launched = await launchChrome({ userDataDir, port, verbose: args.verbose });
    proc = launched.proc;
    // Ensure Chrome + temp dir are cleaned up even on Ctrl+C / SIGTERM / hard crash.
    registerCleanup(proc, userDataDir);
    page = new CDP(launched.pageTarget.webSocketDebuggerUrl);
    await page.connect();
    await page.enableDomains();
    const capture = attachCapture(page);

    // Probe for the Phase 2 ?test= hook (skips hook scenarios until it lands).
    // Poll instead of a fixed sleep: on a cold CDN the first load can exceed the
    // 15s readyState wait (which navigate() swallows), so a single 1.5s sleep was
    // flaky. waitFor polls the game-screen flex state up to 10s.
    let hookAvailable = false;
    if (!args.noScreens) {
      await page.eval('localStorage.clear(); true').catch(() => {});
      await page.navigate(args.server + '/?test=1&screen=arena');
      hookAvailable = await page
        .waitFor(`getComputedStyle(document.getElementById('game-screen')).display === 'flex'`, 10000)
        .then(() => true)
        .catch(() => false);
      console.error(`[qa] Phase 2 ?test= hook available: ${hookAvailable}`);
    }

    const scenarios = [];
    for (const vp of viewports) {
      await page.setViewport(vp.width, vp.height);
      for (const seed of seeds) {
        for (const sc of SCENARIOS) {
          if (sc.hook && (!hookAvailable || args.noScreens)) {
            scenarios.push(
              skippedScenario(sc, vp, seed, hookAvailable ? 'disabled via --no-screens' : 'Phase 2 ?test= hook not implemented yet')
            );
            continue;
          }
          const capStart = capture.length; // snapshot: late events from the previous
          const ctx = { page, vp, seed, server: args.server, shots: args.noScreens ? null : shotsDir, hook: hookAvailable };
          const finish = (partial) =>
            scenarios.push({
              name: sc.name,
              viewport: vp.key,
              viewportWidth: vp.width,
              viewportHeight: vp.height,
              seed,
              ...partial,
              console: capture.slice(capStart).map(classifyEvent),
            });
          try {
            const res = await sc.run(ctx);
            finish({
              checks: res.checks,
              screenshots: res.screenshots.map((s) => relative(outDir, join(shotsDir, s))),
            });
          } catch (e) {
            finish({
              checks: [{ name: 'RUN-ERROR', pass: false, detail: e.message }],
              screenshots: [],
              error: e.message,
            });
          }
        }
      }
    }

    const report = buildReport({
      meta: {
        date: new Date().toISOString(),
        server: args.server,
        chrome: process.env.CHROME_BIN || 'google-chrome',
        node: process.version,
        hookAvailable,
        elapsedMs: Date.now() - startedAt,
      },
      scenarios,
    });

    const jsonPath = writeJson(report, outDir);
    const mdPath = writeMarkdown(report, outDir);
    process.stdout.write(terminalSummary(report, { verbose: args.verbose }));
    console.error(`[qa] reports: ${jsonPath}`);
    console.error(`[qa] reports: ${mdPath}`);
    console.error(`[qa] screenshots: ${shotsDir}`);

    if (report.summary.failed > 0 || report.summary.errored > 0 || report.summary.consoleFailures > 0) {
      process.exitCode = 1;
    }
  } finally {
    try {
      page && (await page.close());
    } catch {}
    try {
      killChrome(proc);
    } catch {}
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((e) => {
  console.error(`[qa] FATAL: ${e.message}`);
  process.exit(2);
});
