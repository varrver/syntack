#!/usr/bin/env node
/**
 * SYNTACK QA — golden-image visual regression (spec §12, zero deps).
 *
 * Captures a deterministic set of game screens under `prefers-reduced-motion:
 * reduce` (freezes CSS animations so frames are reproducible across runs) and
 * either stores them as baselines (`--capture`) or diffs fresh captures against
 * the stored baselines with tolerance-based pixel comparison.
 *
 * Usage:
 *   node qa/visual-regress.mjs --capture            # (re)build qa/baselines/
 *   node qa/visual-regress.mjs                      # compare vs baselines
 *   node qa/visual-regress.mjs --tolerance 0.02 --max-delta 40
 *   node qa/visual-regress.mjs --only arena-desktop
 *
 * Exit codes: 0 = all within tolerance · 1 = regression(s) found · 2 = error
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launchChrome, CDP, pickPort, sleep, urlWith, killChrome } from './lib/cdp.mjs';
import { decodePng, encodePng, diffRgba } from './lib/png.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER = 'http://localhost:8123';
const OUT = join(ROOT, 'qa', 'baselines');
const DIFFS = join(ROOT, 'qa', 'reports', 'visual-diffs');
const MANIFEST = 'manifest.json';

const SHOTS = [
  { name: 'splash', width: 1280, height: 800, navigate: (u) => u },
  { name: 'home', width: 1280, height: 800, navigate: (u) => u, ready: `!!document.getElementById('btn-splash-start')`, click: '#btn-splash-start', wait: `getComputedStyle(document.getElementById('home-screen')).display === 'flex'` },
  { name: 'lobby', width: 1280, height: 800, hook: { test: 1, screen: 'lobby', seed: 1 }, wait: `getComputedStyle(document.getElementById('lobby-screen')).display === 'flex'` },
  { name: 'arena-desktop', width: 1280, height: 800, hook: { test: 1, screen: 'arena', seed: 1 }, wait: `window.__qaHold === true` },
  { name: 'intents-attack', width: 1280, height: 800, hook: { test: 1, screen: 'arena', seed: 1, intent: 'attack' }, wait: `/ATTACK/.test((document.getElementById('enemy-intent')||{}).textContent||'') && window.__qaHold === true` },
  { name: 'endoverlay-victory', width: 1280, height: 800, hook: { test: 1, screen: 'arena', seed: 1, outcome: 'victory' }, wait: `getComputedStyle(document.getElementById('end-overlay')).display === 'flex'` },
  { name: 'arena-mobile', width: 375, height: 667, hook: { test: 1, screen: 'arena', seed: 1 }, wait: `window.__qaHold === true` },
  { name: 'arena-landscape', width: 812, height: 375, hook: { test: 1, screen: 'arena', seed: 1 }, wait: `window.__qaHold === true` },
];

function parseArgs(argv) {
  const a = { capture: false, tolerance: 0.02, maxDelta: 40, only: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--capture': a.capture = true; break;
      case '--tolerance': a.tolerance = parseFloat(val); i++; break;
      case '--max-delta': a.maxDelta = parseInt(val, 10); i++; break;
      case '--only': a.only = val; i++; break;
      case '--verbose': a.verbose = true; break;
      default: throw new Error(`Unknown flag: ${key}`);
    }
  }
  return a;
}

function fingerprint() {
  const h = createHash('sha256');
  for (const f of ['index.html', 'css/styles.css', 'js/game.js', 'js/motion.js', 'js/audio.js']) {
    h.update(f + ':' + readFileSync(join(ROOT, f)).length + ';');
  }
  return h.digest('hex').slice(0, 12);
}

async function captureShot(page, shot, server, verbose) {
  const url = shot.hook ? urlWith(server, shot.hook) : server + '/index.html';
  await page.eval('localStorage.clear(); true').catch(() => {});
  await page.setViewport(shot.width, shot.height);
  await page.navigate(url);
  if (shot.ready) await page.waitFor(shot.ready, 20000);
  if (shot.click) await page.click(shot.click);
  if (shot.wait) await page.waitFor(shot.wait, 20000);
  // Wait for webfonts so text metrics are stable (deterministic golden frames).
  // Explicitly force-load the display faces first: fonts.ready can resolve
  // before Tailwind's runtime JIT applies the font-* utilities (i.e. before
  // the @font-face requests even start), racing the capture with a mid-swap
  // layout. Then race ready against a generous cap for slow/cold networks.
  await page
    .eval(
      `(async () => {
         if (!document.fonts) return;
         const cap = (ms) => new Promise((r) => setTimeout(r, ms));
         try {
           await Promise.race([
             Promise.all([
               document.fonts.load('900 2rem Orbitron'),
               document.fonts.load('0.55rem "Press Start 2P"'),
             ]),
             cap(15000),
           ]);
         } catch {}
         await Promise.race([document.fonts.ready, cap(15000)]);
       })()`,
      { awaitPromise: true }
    )
    .catch(() => {});
  // Layout quiescence: late font swaps and Tailwind's runtime JIT can mutate
  // text metrics AFTER fonts.ready resolves (hidden screens lay out when
  // revealed mid-load and don't always reflow on swap). Hold until no font
  // face is still loading AND the key text layout hash is identical across
  // two consecutive samples.
  await page
    .eval(
      `(async () => {
         const sel = 'h1, h2, .end-stat-value, .end-stat-label, .lobby-deck-chip';
         const hash = () => [...document.querySelectorAll(sel)].map((el) => {
           const r = el.getBoundingClientRect();
           const cs = getComputedStyle(el);
           return [el.tagName, Math.round(r.width * 10), Math.round(r.height * 10), cs.fontFamily, cs.letterSpacing].join(':');
         }).join('|');
         let prev = null;
         for (let i = 0; i < 60; i++) {
           const anyLoading = [...document.fonts].some((f) => f.status === 'loading');
           const cur = anyLoading ? 'fonts-loading' : hash();
           if (!anyLoading && cur !== '' && cur === prev) return true;
           prev = cur;
           await new Promise((r) => setTimeout(r, 100));
         }
         return false;
       })()`,
      { awaitPromise: true }
    )
    .catch(() => {});
  await sleep(400);
  const buf = Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  if (verbose) console.error(`[vreg] captured ${shot.name} (${buf.length} bytes)`);
  return buf;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DIFFS, { recursive: true });
  const shots = args.only ? SHOTS.filter((s) => s.name === args.only) : SHOTS;
  if (!shots.length) throw new Error(`Unknown shot: ${args.only}`);

  const port = await pickPort();
  const userDataDir = mkdtempSync(join(tmpdir(), 'syntack-vreg-'));
  let proc, page;
  const results = [];
  try {
    const launched = await launchChrome({ userDataDir, port, verbose: args.verbose });
    proc = launched.proc;
    page = new CDP(launched.pageTarget.webSocketDebuggerUrl);
    await page.connect();
    await page.enableDomains();
    await page.setReducedMotion('reduce'); // freeze CSS animations for determinism

    for (const shot of shots) {
      const fresh = await captureShot(page, shot, SERVER, args.verbose);
      const name = shot.name + '.png';
      if (args.capture) {
        writeFileSync(join(OUT, name), fresh);
        results.push({ name, mode: 'capture', width: shot.width, height: shot.height });
        continue;
      }
      const basePath = join(OUT, name);
      if (!existsSync(basePath)) {
        results.push({ name, mode: 'compare', status: 'NO-BASELINE', detail: `run --capture first` });
        continue;
      }
      const base = decodePng(readFileSync(basePath));
      const cur = decodePng(fresh);
      if (base.width !== cur.width || base.height !== cur.height) {
        results.push({ name, mode: 'compare', status: 'SIZE-CHANGED', detail: `${base.width}x${base.height} vs ${cur.width}x${cur.height}` });
        continue;
      }
      const d = diffRgba(base.rgba, cur.rgba, args.maxDelta, base.width);
      const pass = d.diffFraction <= args.tolerance;
      if (!pass) {
        // write a red-overlay diff image for eyeballing
        const overlay = new Uint8Array(d.totalPixels * 4);
        for (let i = 0; i < d.totalPixels; i++) {
          const o = i * 4;
          const dx = i % base.width;
          const dy = (i / base.width) | 0;
          const within = d.bbox && dx >= d.bbox.minX && dx <= d.bbox.maxX && dy >= d.bbox.minY && dy <= d.bbox.maxY;
          const diff = within && (Math.abs(base.rgba[o] - cur.rgba[o]) > args.maxDelta || Math.abs(base.rgba[o + 1] - cur.rgba[o + 1]) > args.maxDelta || Math.abs(base.rgba[o + 2] - cur.rgba[o + 2]) > args.maxDelta);
          if (diff) {
            overlay[o] = 255; overlay[o + 1] = Math.min(cur.rgba[o + 1], 70); overlay[o + 2] = Math.min(cur.rgba[o + 2], 70); overlay[o + 3] = 255;
          } else {
            overlay[o] = (cur.rgba[o] * 0.55) | 0;
            overlay[o + 1] = (cur.rgba[o + 1] * 0.55) | 0;
            overlay[o + 2] = (cur.rgba[o + 2] * 0.55) | 0;
            overlay[o + 3] = 255;
          }
        }
        writeFileSync(join(DIFFS, name), encodePng({ width: base.width, height: base.height, rgba: overlay }));
      }
      results.push({
        name, mode: 'compare', status: pass ? 'PASS' : 'DIFF', pass,
        diffFraction: +d.diffFraction.toFixed(5),
        diffPixels: d.diffPixels, maxDelta: d.maxDelta,
        bbox: d.bbox, detail: `frac=${d.diffFraction.toFixed(5)} px=${d.diffPixels}/${d.totalPixels} maxΔ=${d.maxDelta}`,
      });
    }

    const diffs = results.filter((r) => r.mode === 'compare' && r.status === 'DIFF');
    const missing = results.filter((r) => r.status === 'NO-BASELINE');
    console.log(`\n  SYNTACK golden-image regression${args.capture ? ' (capture)' : ''}  — ${shots.length} shot(s)`);
    for (const r of results) {
      const icon = r.mode === 'capture' ? '📸' : r.status === 'PASS' ? '✔' : r.status === 'DIFF' ? '✘' : '⚠';
      console.log(`  ${icon} ${(r.name || '').padEnd(24)} ${r.mode === 'capture' ? 'baseline saved' : r.status + '  ' + (r.detail || '')}`);
    }
    console.log(`  baseline fingerprint: ${fingerprint()}`);
    if (diffs.length) {
      console.log(`  REGRESSIONS: ${diffs.map((d) => d.name).join(', ')} — diff overlays in ${DIFFS}`);
      process.exitCode = 1;
    } else if (missing.length) {
      console.log(`  no baselines for ${missing.length} shot(s) — run with --capture`);
    } else {
      console.log('  all shots within tolerance ✓');
    }
    writeFileSync(
      join(DIFFS, 'visual-regress.json'),
      JSON.stringify({ mode: args.capture ? 'capture' : 'compare', tolerance: args.tolerance, maxDelta: args.maxDelta, fingerprint: fingerprint(), results }, null, 2)
    );
  } finally {
    try { page && await page.close(); } catch {}
    try { killChrome(proc); } catch {}
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
