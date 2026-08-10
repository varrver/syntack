#!/usr/bin/env node
/**
 * SYNTACK Phase 3 — checklist drive.
 *
 * Walks the 10 items of qa/MANUAL-CHECKLIST.md through a real (headless)
 * Chromium via CDP: synthetic mouse/keyboard events, computed-style reads,
 * DOM state, and screenshots. Subjective aspects (audio feel, texture)
 * are verified through objective proxies; the audible/subjective residue is
 * noted per item. Outputs qa/reports/checklist-drive.json + a terminal table.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, CDP, pickPort, sleep, urlWith, killChrome } from './lib/cdp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER = 'http://localhost:8123';
const SHOTS = join(ROOT, 'qa', 'screenshots');
const OUT = join(ROOT, 'qa', 'reports');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const results = {}; // item key -> { status, checks: [{name, pass, detail}], screenshots }

function init(item) {
  if (!results[item]) results[item] = { status: 'PASS', checks: [], screenshots: [] };
  return results[item];
}
function record(item, name, pass, detail) {
  const r = init(item);
  r.checks.push({ name, pass: !!pass, detail });
  if (!pass) r.status = 'FAIL';
}
function shot(item, name) {
  const r = init(item);
  const f = `checklist-${name}.png`;
  r.screenshots.push(f);
  return join(SHOTS, f);
}

/** Poll an expression until its value is unchanged across two consecutive
 * reads — used to wait out Motion's spring settle (opacity can reach 1 while
 * an underdamped scale is still moving a fraction of a pixel). */
const waitStable = async (page, expr, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  let prev = null;
  while (Date.now() < deadline) {
    const cur = await page.eval(expr);
    if (prev !== null && cur === prev) return cur;
    prev = cur;
    await sleep(80);
  }
  throw new Error(`waitStable timeout: ${expr}`);
};

const mouse = (page, type, x, y, o = {}) =>
  page.send('Input.dispatchMouseEvent', {
    type, x: Math.round(x), y: Math.round(y),
    button: o.button || 'none',
    clickCount: o.clickCount || 0,
  });
const keyDown = (page, key, code, vk) =>
  page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
const keyUp = (page, key, code, vk) =>
  page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
const pressKey = async (page, key, code, vk) => { await keyDown(page, key, code, vk); await keyUp(page, key, code, vk); };
const center = (page, sel) =>
  page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; })()`);
const hover = async (page, sel) => { const c = await center(page, sel); if (!c) throw new Error('hover: no ' + sel); await mouse(page, 'mouseMoved', c.x, c.y); return c; };
const clickAt = async (page, sel) => { const c = await hover(page, sel); await mouse(page, 'mousePressed', c.x, c.y, { button: 'left', clickCount: 1 }); await mouse(page, 'mouseReleased', c.x, c.y, { button: 'left', clickCount: 1 }); return c; };

async function fresh(page, params) {
  await page.eval('localStorage.clear(); true').catch(() => {});
  await page.navigate(urlWith(SERVER, params));
}

async function enterArena(page, seed = 1) {
  await fresh(page, { test: 1, screen: 'arena', seed });
  await page.waitFor(`getComputedStyle(document.getElementById('game-screen')).display === 'flex'`, 15000);
}

async function main() {
  const port = await pickPort();
  const userDataDir = mkdtempSync(join(tmpdir(), 'syntack-drive-'));
  let proc, page;
  const consoleEvents = [];
  try {
    const launched = await launchChrome({ userDataDir, port });
    proc = launched.proc;
    page = new CDP(launched.pageTarget.webSocketDebuggerUrl);
    await page.connect();
    await page.enableDomains();
    page.on('Runtime.consoleAPICalled', (p) => {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consoleEvents.push({ type: p.type, text });
    });
    page.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails || {};
      consoleEvents.push({ type: 'exception', text: (d.exception && d.exception.description) || d.text });
    });
    await page.setViewport(1280, 800);

    /* ── Item 1: card hover — lift + no clip ── */
    {
      const item = '1-card-hover';
      await enterArena(page, 1);
      await sleep(1500); // let the hand-stagger animation settle (it writes inline transforms)
      const before = await page.eval(`(() => {
        const card = document.querySelector('#hand-container .card');
        return { transform: getComputedStyle(card).transform, top: Math.round(card.getBoundingClientRect().top * 10) / 10 };
      })()`);
      await hover(page, '#hand-container .card');
      await sleep(250); // transition 150ms
      const after = await page.eval(`(() => {
        const card = document.querySelector('#hand-container .card');
        const cont = document.getElementById('hand-container');
        const cb = card.getBoundingClientRect(), tb = cont.getBoundingClientRect();
        return {
          transform: getComputedStyle(card).transform,
          inline: card.style.transform || '(none)',
          hovered: card.matches(':hover'),
          cardTop: Math.round(cb.top * 10) / 10,
          contTop: Math.round(tb.top * 10) / 10,
          clipped: cb.top < tb.top,
          shimmer: getComputedStyle(card, '::before').backgroundImage.includes('linear-gradient'),
        };
      })()`);
      record(item, 'hover-engages', after.hovered, `hovered=${after.hovered}`);
      // fix-agnostic: transform must CHANGE on hover AND the card's top must rise ~16px
      record(item, 'hover-lift-transform', after.transform !== before.transform && before.top - after.cardTop >= 10, `before=${before.transform}(${before.top}) after=${after.transform}(${after.cardTop}) inline=${after.inline}`);
      record(item, 'hover-shimmer-pseudo', after.shimmer, `::before bg=${after.shimmer}`);
      record(item, 'top-not-clipped', !after.clipped, `cardTop=${after.cardTop} contTop=${after.contTop} clipped=${after.clipped}`);
      await page.screenshot(shot(item, 'hover-card'));
      await mouse(page, 'mouseMoved', 5, 5); // move off
    }

    /* ── Item 2: glitch title ── */
    {
      const item = '2-glitch-title';
      await fresh(page, {});
      await page.waitFor(`!!document.getElementById('btn-splash-start')`, 15000);
      const h1 = await page.eval(`(() => {
        const t = document.querySelector('#splash-screen h1.glitch');
        const b = getComputedStyle(t, '::before'), a = getComputedStyle(t, '::after');
        return { anim: b.animationName, animAfter: a.animationName, dur: b.animationDuration };
      })()`);
      record(item, 'glitch-animations-declared', h1.anim === 'glitchShift' && h1.animAfter === 'glitchShift', `before=${h1.anim} after=${h1.animAfter}`);
      // sample pseudo opacity over 3.4s to catch an actual flicker frame
      const samples = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 3400) {
        const o = await page.eval(`parseFloat(getComputedStyle(document.querySelector('#splash-screen h1.glitch'), '::before').opacity)`);
        samples.push(o);
        await sleep(70);
      }
      const flickered = samples.some((o) => o > 0.05);
      record(item, 'flicker-frame-observed', flickered, `maxOpacity=${Math.max(...samples).toFixed(2)} samples=${samples.length}`);
      await page.screenshot(shot(item, 'glitch-splash'));
      // reduced motion suppresses
      await page.setReducedMotion('reduce');
      await fresh(page, {});
      await page.waitFor(`!!document.getElementById('btn-splash-start')`, 15000);
      const rm = await page.eval(`getComputedStyle(document.querySelector('#splash-screen h1.glitch'), '::before').animationDuration`);
      const rmSamples = [];
      for (let i = 0; i < 6; i++) { rmSamples.push(await page.eval(`parseFloat(getComputedStyle(document.querySelector('#splash-screen h1.glitch'), '::before').opacity)`)); await sleep(120); }
      const staticUnderRm = new Set(rmSamples.map((o) => o.toFixed(3))).size === 1;
      record(item, 'reduced-motion-suppresses', parseFloat(rm) <= 0.02 && staticUnderRm, `duration=${rm} samples=${rmSamples.join(',')}`);
      await page.setReducedMotion('no-preference');
    }

    /* ── Item 3: button press depth ── */
    {
      const item = '3-button-press';
      await fresh(page, {});
      await page.waitFor(`!!document.getElementById('btn-splash-start')`, 15000);
      await clickAt(page, '#btn-splash-start');
      await page.waitFor(`getComputedStyle(document.getElementById('home-screen')).display === 'flex'`, 15000);
      // The splash→home transition animates (350ms fade-in with a 0.92→1 scale
      // on the home screen); wait until the screen's transform is fully stable
      // so the button geometry we measure below isn't caught mid-scale.
      await waitStable(page, `getComputedStyle(document.getElementById('home-screen')).transform`);
      const c = await center(page, '#btn-menu-start');
      const rect = () => page.eval(`(() => { const b = document.getElementById('btn-menu-start').getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }; })()`);
      const idleRect = await rect();
      const idle = await page.eval(`getComputedStyle(document.getElementById('btn-menu-start')).transform`);
      await mouse(page, 'mouseMoved', c.x, c.y);
      await mouse(page, 'mousePressed', c.x, c.y, { button: 'left', clickCount: 1 });
      await sleep(180);
      const pressed = await page.eval(`getComputedStyle(document.getElementById('btn-menu-start')).transform`);
      await page.screenshot(shot(item, 'button-pressed'));
      // Release OFF the button so no click fires (a real click would navigate away)
      await mouse(page, 'mouseMoved', 5, 5);
      await mouse(page, 'mouseReleased', 5, 5, { button: 'left', clickCount: 0 });
      await sleep(180);
      const released = await page.eval(`getComputedStyle(document.getElementById('btn-menu-start')).transform`);
      const afterRect = await rect();
      record(item, 'active-collapses', /matrix\(1, 0, 0, 1, 0, [1-9]/.test(pressed), `idle=${idle} pressed=${pressed}`);
      record(item, 'releases-back', released === 'none' || released === idle, `released=${released}`);
      record(item, 'no-layout-shift', afterRect.w > 0 && afterRect.x === idleRect.x && afterRect.y === idleRect.y, `idle=${JSON.stringify(idleRect)} after=${JSON.stringify(afterRect)}`);
    }

    /* ── Item 4: felt + scanlines ── */
    {
      const item = '4-felt-scanlines';
      await enterArena(page, 1);
      const d = await page.eval(`(() => {
        const table = document.querySelector('.felt-table');
        const scan = document.querySelector('.scanlines');
        const body = document.body;
        return {
          noise: getComputedStyle(table, '::before').backgroundImage,
          feltBg: getComputedStyle(table).backgroundImage,
          scanBg: scan ? getComputedStyle(scan).backgroundImage : '',
          scanBlend: scan ? getComputedStyle(scan).mixBlendMode : '',
          swirl: getComputedStyle(body, '::before').backgroundImage,
          swirlBlur: getComputedStyle(body, '::before').filter,
          swirlOpacity: getComputedStyle(body, '::before').opacity,
        };
      })()`);
      record(item, 'felt-noise-texture', d.noise.includes('data:image/svg') || d.noise.includes('feTurbulence'), `noise=${d.noise.slice(0, 60)}...`);
      record(item, 'scanlines-present-subtle', d.scanBg.includes('repeating-linear-gradient') && d.scanBlend === 'multiply', `blend=${d.scanBlend}`);
      record(item, 'swirl-calm-backdrop', d.swirl.includes('conic-gradient') && parseFloat(d.swirlOpacity) <= 0.75 && d.swirlBlur.includes('60px'), `opacity=${d.swirlOpacity} blur=${d.swirlBlur}`);
      await page.screenshot(shot(item, 'felt-arena'));
    }

    /* ── Item 5: terminal cursor + auto-scroll + brackets regression ── */
    {
      const item = '5-terminal';
      await enterArena(page, 1);
      await page.eval(`document.getElementById('terminal').scrollTop = 0; true`);
      const before = await page.eval(`document.getElementById('terminal').scrollTop`);
      await clickAt(page, '#hand-container .card'); // logs "Execute: ..."
      await sleep(450);
      const afterLog = await page.eval(`(() => { const t = document.getElementById('terminal'); return { top: t.scrollTop, max: t.scrollHeight - t.clientHeight, logs: t.querySelectorAll('.terminal-log').length }; })()`);
      record(item, 'logs-auto-scroll', afterLog.top > before && afterLog.top >= afterLog.max - 2, `before=${before} after=${afterLog.top}/${afterLog.max} logs=${afterLog.logs}`);
      const brackets = await page.eval(`(() => {
        const term = document.getElementById('terminal');
        const ep = document.getElementById('enemyBox');
        return {
          termBefore: getComputedStyle(term, '::before').content,
          termAfter: getComputedStyle(term, '::after').content,
          enemyBefore: ep ? getComputedStyle(ep, '::before').content : '',
        };
      })()`);
      record(item, 'terminal-has-no-brackets', brackets.termBefore === 'none' && brackets.termAfter === 'none', JSON.stringify(brackets));
      record(item, 'enemy-panel-keeps-brackets', brackets.enemyBefore !== 'none', `enemy::before=${brackets.enemyBefore}`);
      const colors = await page.eval(`(() => {
        const m = {}; document.querySelectorAll('#terminal .terminal-log').forEach((l) => { m[l.className.match(/text-balatro-(\\w+)/)?.[1] || 'x'] = getComputedStyle(l).color; });
        return m;
      })()`);
      record(item, 'log-colors-distinct', new Set(Object.values(colors)).size >= 3, JSON.stringify(colors));
    }

    /* ── Item 6: floating damage numbers ── */
    {
      const item = '6-float-damage';
      await enterArena(page, 1);
      await clickAt(page, '#hand-container .card');
      await sleep(600); // card-play anim (350ms) completes, then action() fires the floater
      const mid = await page.eval(`(() => {
        const fs = [...document.querySelectorAll('#floatDmgContainer .float-dmg')];
        return { count: fs.length, texts: fs.map((f) => f.textContent), anim: fs[0] ? getComputedStyle(fs[0]).animationName : '' };
      })()`);
      await page.screenshot(shot(item, 'float-damage'));
      await sleep(1400);
      const gone = await page.eval(`document.querySelectorAll('#floatDmgContainer .float-dmg').length`);
      record(item, 'floaters-spawn-with-text', mid.count > 0 && mid.texts.some((t) => t.length > 0), JSON.stringify(mid));
      record(item, 'floatUp-animation', mid.anim === 'floatUp', `anim=${mid.anim}`);
      record(item, 'floaters-clean-up', gone === 0, `after1.4s=${gone}`);
    }

    /* ── Item 7: audio — sync, aria-pressed, persistence, asset 200 ── */
    {
      const item = '7-audio';
      await enterArena(page, 1);
      const before = await page.eval(`(() => ({ a: document.getElementById('btnMute').getAttribute('aria-pressed'), home: document.getElementById('btnMuteHome').getAttribute('aria-pressed'), muted: document.getElementById('btnMute').classList.contains('muted') }))()`);
      await clickAt(page, '#btnMute');
      await sleep(120);
      const after = await page.eval(`(() => ({ a: document.getElementById('btnMute').getAttribute('aria-pressed'), home: document.getElementById('btnMuteHome').getAttribute('aria-pressed'), muted: document.getElementById('btnMute').classList.contains('muted'), icon: document.getElementById('btnMute').querySelector('.icon-slot svg').innerHTML.slice(0, 40), ls: localStorage.getItem('syntack_muted') }))()`);
      await clickAt(page, '#btnMute');
      await sleep(120);
      const after2 = await page.eval(`document.getElementById('btnMute').getAttribute('aria-pressed')`);
      record(item, 'mute-sync-home-and-arena', after.a === 'true' && after.home === 'true' && after.a !== before.a, `before=${before.a} after=${after.a}/${after.home}`);
      record(item, 'muted-class-and-icon-swap', after.muted && after.icon !== '', `muted=${after.muted} icon=${after.icon.slice(0, 30)}`);
      record(item, 'aria-pressed-toggles', after.a === 'true' && after2 === 'false', `on=${after.a} off=${after2}`);
      record(item, 'mute-persists-localStorage', after.ls === 'true', `ls=${after.ls}`);
      // volume sync
      await page.eval(`(() => { const s = document.getElementById('volSlider'); s.value = 0.3; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(80);
      const vol = await page.eval(`({ home: document.getElementById('volSliderHome').value, ls: localStorage.getItem('syntack_volume') })`);
      record(item, 'volume-slider-sync', vol.home === '0.3' && vol.ls === '0.3', JSON.stringify(vol));
      // reload keeps muted state — plain navigate (NOT fresh, which clears localStorage)
      await page.eval(`(() => { const b = document.getElementById('btnMute'); b.click(); return true; })()`); // mute again
      await sleep(120);
      await page.navigate(urlWith(SERVER, { test: 1, screen: 'arena', seed: 1 }));
      await page.waitFor(`getComputedStyle(document.getElementById('game-screen')).display === 'flex'`, 15000);
      const persisted = await page.eval(`({ a: document.getElementById('btnMute').getAttribute('aria-pressed'), muted: document.getElementById('btnMute').classList.contains('muted') })`);
      record(item, 'reload-persists-muted', persisted.a === 'true' && persisted.muted, JSON.stringify(persisted));
      // victory asset reachable (awaited fetch)
      const asset = await page.eval(`fetch('assets/audio/victory.mp3').then((r) => r.status).catch(() => 0)`, { awaitPromise: true });
      record(item, 'victory-mp3-loads-200', asset === 200, `status=${asset}`);
    }

    /* ── Item 8: focus & keyboard ── */
    {
      const item = '8-focus-keyboard';
      await fresh(page, {});
      await page.waitFor(`!!document.getElementById('btn-splash-start')`, 15000);
      // Tab on splash → PLAY focused
      await pressKey(page, 'Tab', 'Tab', 9);
      await sleep(50);
      const splashFocus = await page.eval(`document.activeElement && document.activeElement.id`);
      record(item, 'tab-order-splash', splashFocus === 'btn-splash-start', `active=${splashFocus}`);
      // arena keyboard card play: Enter
      await enterArena(page, 1);
      const cards = await page.eval(`document.querySelectorAll('#hand-container .card').length`);
      await page.eval(`document.querySelectorAll('#hand-container .card')[0].focus(); true`);
      await pressKey(page, 'Enter', 'Enter', 13);
      await sleep(500);
      const afterEnter = await page.eval(`document.querySelectorAll('#hand-container .card').length`);
      record(item, 'enter-plays-card', afterEnter === cards - 1, `cards ${cards} -> ${afterEnter}`);
      // Space plays a card
      await enterArena(page, 2);
      const cards2 = await page.eval(`document.querySelectorAll('#hand-container .card').length`);
      await page.eval(`document.querySelectorAll('#hand-container .card')[0].focus(); true`);
      await pressKey(page, ' ', 'Space', 32);
      await sleep(500);
      const afterSpace = await page.eval(`document.querySelectorAll('#hand-container .card').length`);
      record(item, 'space-plays-card', afterSpace === cards2 - 1, `cards ${cards2} -> ${afterSpace}`);
      // focus trap inside archive modal + Escape
      await fresh(page, {});
      await page.waitFor(`!!document.getElementById('btn-splash-start')`, 15000);
      await clickAt(page, '#btn-splash-start');
      await page.waitFor(`getComputedStyle(document.getElementById('home-screen')).display === 'flex'`, 15000);
      await page.waitFor(`parseFloat(getComputedStyle(document.getElementById('home-screen')).opacity) > 0.99`, 5000);
      // mouse click → no ring (checked before ANY keyboard event in this session)
      await clickAt(page, '#btn-menu-archive');
      await page.waitFor(`getComputedStyle(document.getElementById('archive-modal')).display === 'flex'`, 15000);
      const mouseRing = await page.eval(`(() => { const el = document.activeElement; return { id: el.id || el.className, fv: el.matches(':focus-visible'), ow: getComputedStyle(el).outlineWidth }; })()`);
      record(item, 'no-ring-on-mouse-focus', mouseRing.fv === false, `active=${mouseRing.id} fv=${mouseRing.fv} width=${mouseRing.ow}`);
      const trapped = [];
      for (let i = 0; i < 8; i++) { await pressKey(page, 'Tab', 'Tab', 9); await sleep(30); trapped.push(await page.eval(`document.activeElement.id || document.activeElement.className`)); }
      const inside = await page.eval(`document.getElementById('archive-modal').contains(document.activeElement)`);
      record(item, 'tab-trapped-in-modal', inside, `inside=${inside} seq=${trapped.join(' > ')}`);
      await pressKey(page, 'Escape', 'Escape', 27);
      await sleep(250);
      const esc = await page.eval(`({ disp: getComputedStyle(document.getElementById('archive-modal')).display, active: document.activeElement.id })`);
      record(item, 'escape-closes-restores', esc.disp === 'none' && esc.active === 'btn-menu-archive', JSON.stringify(esc));
      // keyboard Tab → ring appears on the newly focused control
      await pressKey(page, 'Tab', 'Tab', 9); await sleep(30);
      const kbRing = await page.eval(`(() => { const el = document.activeElement; return { id: el.id || el.className, fv: el.matches(':focus-visible'), ow: getComputedStyle(el).outlineWidth }; })()`);
      record(item, 'focus-visible-ring-keyboard', kbRing.fv === true && parseFloat(kbRing.ow) > 0, `active=${kbRing.id} fv=${kbRing.fv} width=${kbRing.ow}`);
    }

    /* ── Item 9: scrollbars & selection CSS ── */
    {
      const item = '9-scrollbars-selection';
      await fresh(page, {});
      await page.waitFor(`!!document.getElementById('btn-splash-start')`, 15000);
      const css = await page.eval(`(() => {
        const out = [];
        for (const sheet of document.styleSheets) {
          if (!/styles\\.css/.test(sheet.href || '')) continue;
          let rules; try { rules = sheet.cssRules; } catch { continue; }
          for (const r of rules) {
            const sel = r.selectorText || '';
            if (sel.includes('::-webkit-scrollbar') || sel.includes('::selection')) out.push({ sel, text: r.cssText });
          }
        }
        return out;
      })()`);
      const has = (sel, needle) => css.some((r) => r.sel === sel && (!needle || r.text.includes(needle)));
      record(item, 'terminal-hand-scrollbar-styles', has('.terminal::-webkit-scrollbar') && has('.terminal::-webkit-scrollbar-thumb') && has('.hand-container::-webkit-scrollbar'), `rules=${css.length}`);
      // CSSOM serializes #1a6b4e as rgb(26, 107, 78), so accept both spellings
      record(item, 'global-scrollbar-thumb', has('::-webkit-scrollbar-thumb', '1a6b4e') || has('::-webkit-scrollbar-thumb', '26, 107, 78'), css.map((r) => r.sel).join(', '));
      record(item, 'cyan-selection', has('::selection', '0, 157, 220'), (css.find((r) => r.sel === '::selection') || { text: '' }).text.slice(0, 160));
    }

    /* ── Item 10: 375px + landscape smoke ── */
    {
      const item = '10-mobile-landscape';
      await page.setViewport(375, 667);
      await enterArena(page, 1);
      const mob = await page.eval(`(() => {
        const doc = document.documentElement;
        const hud = document.getElementById('btn-game-home').getBoundingClientRect();
        const exe = document.getElementById('game-screen').querySelector('button[onclick="endTurn()"]').getBoundingClientRect();
        return {
          sw: doc.scrollWidth, iw: window.innerWidth, sh: doc.scrollHeight, ih: window.innerHeight,
          hudTop: hud.top, exeBottom: exe.bottom, exeReachable: exe.bottom <= window.innerHeight || exe.top < document.documentElement.scrollHeight,
        };
      })()`);
      await page.screenshot(shot(item, 'arena-mobile'));
      record(item, 'mobile-no-horizontal-scroll', mob.sw <= mob.iw + 1, `scrollW=${mob.sw}/${mob.iw}`);
      record(item, 'mobile-hud-visible', mob.hudTop >= 0, `hudTop=${mob.hudTop}`);
      record(item, 'mobile-execute-reachable', mob.exeReachable, `exeBottom=${mob.exeBottom} page=${mob.sh}/${mob.ih}`);
      // grid-cols-2 on mobile: chips 0,1 share row 1; chip 2 must be on a different row
      const chipsWrap = await page.eval(`(() => { const cs = [...document.querySelectorAll('.chip-display')]; if (cs.length < 4) return 'na'; const a = cs[0].getBoundingClientRect(), c = cs[2].getBoundingClientRect(); return a.top !== c.top; })()`);
      record(item, 'mobile-chips-wrap-2x2', chipsWrap === true, `chips 0v2 row-wrap=${chipsWrap}`);
      await page.setViewport(812, 375);
      await enterArena(page, 1);
      const land = await page.eval(`(() => {
        const doc = document.documentElement;
        const exe = document.getElementById('game-screen').querySelector('button[onclick="endTurn()"]').getBoundingClientRect();
        return { sw: doc.scrollWidth, iw: window.innerWidth, sh: doc.scrollHeight, ih: window.innerHeight, exeBottom: exe.bottom, hud: document.getElementById('btn-game-home').getBoundingClientRect().top };
      })()`);
      await page.screenshot(shot(item, 'arena-landscape'));
      record(item, 'landscape-scrolls-vertically', land.sw <= land.iw + 1 && land.sh >= land.ih, `scrollW=${land.sw}/${land.iw} pageH=${land.sh}/${land.ih}`);
      record(item, 'landscape-content-reachable', land.exeBottom <= land.sh, `exeBottom=${land.exeBottom} pageH=${land.sh}`);
      record(item, 'landscape-hud-top', land.hud >= 0, `hudTop=${land.hud}`);
    }

    // ── summary ──
    const fails = Object.entries(results).filter(([, r]) => r.status === 'FAIL');
    const table = Object.entries(results).map(([k, r]) =>
      `${r.status === 'PASS' ? '✔' : '✘'} ${k.padEnd(22)} ${r.checks.filter((c) => c.pass).length}/${r.checks.length} checks`
    ).join('\n');
    console.log(table);
    console.log(fails.length ? `\nFAILURES: ${fails.map(([k]) => k).join(', ')}` : '\nALL ITEMS PASS');
    const errs = consoleEvents.filter((e) => e.type === 'error' || e.type === 'exception');
    console.log(`console errors during drive: ${errs.length}`);
    errs.forEach((e) => console.log('  -', e.text.slice(0, 160)));
    writeFileSync(join(OUT, 'checklist-drive.json'), JSON.stringify({ items: results, consoleErrors: errs, consoleEvents }, null, 2));
    console.log('wrote qa/reports/checklist-drive.json');
  } finally {
    try { page && await page.close(); } catch {}
    try { killChrome(proc); } catch {}
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
