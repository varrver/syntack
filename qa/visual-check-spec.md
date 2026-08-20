# SYNTACK Visual-Check System — Specification

**Status:** ✅ **Complete — Phases 1–3 implemented & validated**
**Spec date:** 2026-08-06 · **Completed:** 2026-08-07

**Phase completion summary:**

| Phase | Deliverable | Status | Evidence (latest run on final code) |
|---|---|---|---|
| 1 | CDP harness (`qa/run.mjs` + `qa/lib/*`) | ✅ done | matrix 108/108 scenarios, 636 checks, 0 FAIL |
| 2 | `?test=` hook in `js/game.js` | ✅ done | `hookAvailable: true`; 24 hook scenarios green |
| 3 | Manual checklist (`qa/MANUAL-CHECKLIST.md`) + drive (`qa/drive-checklist.mjs`) | ✅ done | drive 10/10 items, 44/44 checks, 0 console errors; F1 found **and fixed** |

**Related work:** Arena layout fix (`#game-screen` missing `flex flex-col`; hand-container hover clipping; `.hidden` guard rule in `css/styles.css`).

> **Found by this system:** F1 — card hover lift was dead because `animateHandStagger()` left a Motion inline `transform` on every card that overrode `.card:hover`. Fixed in `js/motion.js` (cleanup after stagger/shake + `data-playing` marker); see §10.

> **2026-08-10 maintenance round:** K1, K2, K4 and new K7 fixed; K5/K6 confirmed already
> resolved (see §10). Validated by the full QA matrix under Brave (`CHROME_BIN=/usr/bin/brave-origin`):
> 88/88 scenarios, 552/552 checks, 0 console FAILs, natural process exit, zero orphaned browsers.
> Same round: **code-structure refactor** — static game data moved to `js/config.js`, shared card
> rendering to `js/cards.js`; `js/audio.js` and `js/motion.js` deduplicated (tone/noise-burst + safeAnimate
> helpers); repeated inline HTML colors replaced with CSS utilities. Behavior-preserving (validated by
> the same matrix + golden-image + a11y, all green).

---

## 1. Background & Goals

The browser-automation agent is **unavailable** in this environment (returns empty results), yet a visual check of the game is needed. This was triggered by the arena-layout corruption fix: `#game-screen` lacked `flex flex-col`, so `animateScreenTransition()` adding the `flex` class laid the five arena sections (HUD → chip displays → battle zone → hand → execute button) out in one horizontal row instead of a vertical stack.

Headless Chrome CLI **does work** here (`/usr/bin/google-chrome --headless --screenshot` verified — a 613 KB splash screenshot was captured successfully), and Node v24.18.1 has a **built-in WebSocket client**, so a full Chrome DevTools Protocol (CDP) driver is possible with **zero npm dependencies**.

### Goals (user-confirmed)

1. **Hybrid verification** — an automated CDP harness that clicks through the full game and captures screenshots + console + assertions, **plus** a short manual checklist for interactions that automation can't reach (hover feel, glitch effect, audio).
2. **Full game flow + polish sweep** — splash → main menu → arena → card play → enemy turn → modals → victory/defeat overlay, *plus* a general hunt for other layout/contrast/consistency issues.
3. **Bug-hunting tool** — designed to surface **new** bugs, not just confirm the current fix. It must collect *all* failures in one run.

---

## 2. User-Confirmed Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Verification method | **Hybrid**: automated CDP harness + manual checklist |
| 2 | Scope | **Full game flow + polish sweep** |
| 3 | Outcome focus | **Bug-hunting tool** (surfaces new bugs) |
| 4 | Automation approach | **CDP Node script + tiny `?test=` hook** in game.js (jump-to-screen, RNG seed) |
| 5 | Viewports | **All three + landscape**: 1280×800, 768×1024, 375×667, 812×375 |
| 6 | Correctness judgment | **Both**: programmatic computed-style assertions **and** screenshots |
| 7 | Artifacts | `qa/` folder, **gitignored** (screenshots + reports never committed) |
| 8 | On failure | **Collect everything, then report** — one run surfaces all failures before touching code |
| 9 | Extra checks | Console/network errors, **reduced-motion pass**, **keyboard & focus flow**, **known-issue log** |
| 10 | Console classification | **Uncaught exceptions + failed network requests = FAIL**; warnings logged but don't fail |
| 11 | CDN/network | **Network is a prerequisite**; CDN load failures logged as environment errors, not game bugs |
| 12 | Randomness | **Multiple seeds per run** (default `1, 42, 1337`, configurable) |
| 13 | Test-state forcing | **Hybrid**: play naturally for the main flow; force states only for the end overlay + enemy-intent variants |
| 14 | Baseline evidence | **Fixed state only** — no "broken before" capture |
| 15 | Reporting | **Both**: terminal summary + JSON report, and a rendered Markdown report |

---

## 3. Non-Goals

- No unit tests, no code coverage.
- No golden-image / visual-regression diffing against stored baselines (candidate for future work).
- No CI integration (candidate for future work).
- The harness itself **does not fix** found bugs — it reports them; triage/fix decisions remain manual (per "collect everything, then report").
- No changes to game visuals/gameplay beyond the minimal `?test=` hook (Phase 2) and the **F1 hover-lift fix** (Phase 3 — `js/motion.js` cleanup of stale Motion inline transforms; see §10).

---

## 4. Environment & Prerequisites

| Prerequisite | Status here | Notes |
|---|---|---|
| Node.js ≥ 20 (global `WebSocket`) | ✅ v24.18.1 | Enables CDP over raw WebSocket, no npm installs |
| `google-chrome` binary | ✅ `/usr/bin/google-chrome` | Headless screenshots verified working |
| Python 3 (static server) | ✅ 3.12.3 | `python3 -m http.server 8123` — currently live |
| Network access (Tailwind + Motion CDNs) | assumed | Offline = environment error, not a game bug |
| `assets/audio/victory.mp3` | ✅ 70 KB | Confirmed present |

**Quick check right now (before building anything):** reload `http://localhost:8123`, click **PLAY** → **RUN HACK**, and confirm the arena stacks vertically (HUD on top, then chips, battle zone, hand, execute button). That verifies the flex-col fix manually.

---

## 5. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  qa/run.mjs  (Phase 1 — CDP harness, zero deps)                 │
│  · spawns google-chrome --headless --remote-debugging-port=0    │
│  · minimal CDP client over Node's built-in WebSocket            │
│  · navigates http://localhost:8123/?test=1&screen=…&seed=…      │
│  · clicks through the flow (Runtime.evaluate DOM clicks)        │
│  · captures screenshots (Page.captureScreenshot)                │
│  · collects console/network events (Runtime + Network domains)  │
│  · runs assertions (computed styles via Runtime.evaluate)       │
│  · renders terminal table + qa/reports/report.json + report.md  │
│  qa/drive-checklist.mjs  (Phase 3 — drives the 10 manual items) │
└──────────────────────────────┬─────────────────────────────────┘
                               │ CDP (WebSocket)
┌──────────────────────────────▼─────────────────────────────────┐
│  google-chrome --headless                                      │
│  page: game at localhost:8123                                   │
│  · ?test= hook (Phase 2) seeds RNG / jumps to screens / forces │
│    end-overlay + enemy-intent states                           │
└────────────────────────────────────────────────────────────────┘
```

**Why CDP over plain `--screenshot`?** Plain headless screenshots capture only the initial page state (the splash). CDP enables real DOM clicks (PLAY → RUN HACK), key events (Escape, Tab, Enter), console/network capture, computed-style assertions, and per-step screenshots — everything the bug-hunting goal requires.

---

## 6. Phase 1 — CDP Harness (`qa/run.mjs`)

### 6.1 File layout

```
qa/
  run.mjs               # CLI entry: orchestrates viewports × seeds × scenarios
  drive-checklist.mjs   # Phase 3: drives the 10 manual-checklist items in headless Chrome
  lib/cdp.mjs           # minimal CDP client (launch, connect, evaluate, screenshot, key, click)
  lib/checks.mjs        # assertion library (each check returns { name, pass, detail })
  lib/report.mjs        # terminal table + report.json + report.md writers
  reports/              # generated — gitignored (report.json, report.md, checklist-drive.json)
  screenshots/          # generated — gitignored
  MANUAL-CHECKLIST.md   # Phase 3 deliverable — all 10 items marked, F1 fixed
  visual-regress.mjs    # golden-image: capture/compare baselines (tolerance diff)
  a11y.mjs              # axe-core audit across all screens
  lib/png.mjs           # minimal PNG codec for visual-regress
  baselines/            # golden-image baselines — gitignored
  QA-WRAPUP.md          # final summary + git guidance
.gitignore              # add: qa/reports/, qa/screenshots/, qa/baselines/, server.pid
```

Game module layout (refactored 2026-08-10 — all DOM/class contracts the harness
asserts are unchanged):

```
js/
  game.js             # runtime state, combat, screen manager, ?test= hook
  config.js           # static data: CARD_DEFS, ENEMY_ROSTER, INTENT_CONFIG, constants
  cards.js            # shared card DOM rendering (hand + archive)
  motion.js           # Motion-driven animations (safeAnimate wrapper)
  audio.js            # Web Audio synth (tone / noiseBurst primitives)
vendor/motion.esm.js  # vendored motion@10.18.0 bundle (K2)
```

### 6.2 Command reference

```bash
node qa/run.mjs \
  --server http://localhost:8123 \
  --viewports desktop,tablet,mobile,landscape \
  --seeds 1,42,1337 \
  --out qa/reports
```

| Flag | Default | Meaning |
|---|---|---|
| `--server` | `http://localhost:8123` | Base URL (must be up; harness asserts reachability) |
| `--viewports` | all four | Comma list from the viewport matrix |
| `--seeds` | `1,42,1337` | Comma list of RNG seeds |
| `--out` | `qa/reports` | Report + screenshot output dir |
| `--no-screens` | off | Skip forced-state scenarios (arena/intents/end-overlay) |
| `--verbose` | off | Dump raw console events + CDP traffic |

### 6.3 Viewport matrix

| Key | Size | Breakpoint notes |
|---|---|---|
| `desktop` | 1280×800 | Full arena layout; primary target for the flex-col regression |
| `tablet` | 768×1024 | `sm:` breakpoint (640px) active; battle zone side-by-side |
| `mobile` | 375×667 | `sm:` inactive: chips 2×2, battle zone stacks, hand scrolls |
| `landscape` | 812×375 | Short viewport — verify body scrolls, no content clipped |

### 6.4 Scenarios (per viewport × seed)

1. **splash** — capture splash; assert glitch title element exists, PLAY button has an SVG child.
2. **home** — click PLAY; assert three menu buttons with SVG icons, audio controls present.
3. **arena** — click RUN HACK; wait for transition; **main assertion battery** (see 6.5); capture screenshot.
4. **play-card** — click first hand card; assert RAM decreased, terminal logged a `⟫ Execute:` line, card removed from hand.
5. **end-turn** — click EXECUTE TURN; assert enemy intent box updated, terminal has damage/block log, HP display updated.
6. **modals** — open CARD ARCHIVE, assert grid rendered + modal visible; close with Escape; open HOW TO PLAY; close via X button; assert focus restored to trigger.
7. **intents** (forced via hook) — attack / defend / buff; assert icon + label + side effects (defend heals +4 HP, buff raises `attackDmg`).
8. **end-overlay** (forced via hook) — victory and defeat; assert title text, `data-text` matches, RUN AGAIN button focused.
9. **reduced-motion** — emulate `prefers-reduced-motion: reduce`; re-run arena entry + card play; assert layout intact and animations effectively instant.

### 6.5 Arena assertion battery (computed-style checks)

Ground truth is the current code (selectors verified against `index.html`, `css/styles.css`, `js/game.js`):

| # | Check | Expected |
|---|-------|----------|
| A1 | `#game-screen` display after transition | `flex` (regression gate for the flex-col fix) |
| A2 | `#game-screen` `flex-direction` | `column` (the core fix) |
| A3 | Arena children order | 5 sections: HUD, chips, battle zone, hand, execute — each `flex` item stacked vertically |
| A4 | Horizontal overflow | No document-level horizontal scroll beyond the intended `#hand-container` internal scroll; `#hand-container` itself `overflow-x: auto` |
| A5 | Chip displays | 4 × `.chip-display` present; `#hpBarFill`/`#ramBarFill`/`#enemyHpFill` computed `transform` matches `scaleX(pct)` (initially `1`) |
| A6 | Terminal colors | ≥1 `.terminal-log` with a `text-balatro-{blue,green,red,yellow}` class; computed color equals config hex (`#009ddc`/`#59d67a`/`#fe5f55`/`#f5c542`) |
| A7 | Terminal cursor | `.terminal-cursor` present and blinking (computed `animation-name: cursorBlink`) |
| A8 | Hand | `#hand-container` has 5 `.card` children; each has rarity border class (`border-balatro-purple`/`border-balatro-yellow`) and RAM badge |
| A9 | Intent box | `#enemy-intent` contains an SVG + label matching current intent (e.g. `ATTACK (8 DMG)`) |
| A10 | Modals | `#archive-modal` / `#rules-modal` start `display:none`, become `display:flex` on open, return to `display:none` on close |
| A11 | End overlay | `.end-overlay` `display:flex` with `z-index:300`; title matches VICTORY / SYSTEM FAILURE; `data-text` equals title |
| A12 | HUD | `#btn-game-home`, `#btnMute`, `#volSlider` visible on arena; mute button toggles `.muted` class + `aria-pressed` |

**Failure handling:** every check records `{ name, pass, detail, screenshot? }`. The run **continues** after any failure (collect-everything policy).

### 6.6 Console & network classification

Captured via CDP `Runtime.exceptionThrown`, `Runtime.consoleAPICalled`, `Network.loadingFailed`, and response status ≥ 400.

| Severity | Rules | Examples |
|---|---|---|
| **FAIL** | Uncaught exceptions; `console.error`; failed network requests / HTTP ≥ 400 | JS crash, `victory.mp3` 404, failed module import |
| **WARN** | `console.warn`/`console.info`; known-noise patterns (autoplay policy, favicon 404, CDN fetch fallbacks) | Audio autoplay warning before first click |
| **ENV** | CDN load failures (Tailwind `cdn.tailwindcss.com`, Motion `cdn.jsdelivr.net`) | Offline network — logged, not a game bug |

Known-noise patterns are centralized in a config map in `lib/checks.mjs` so they can be tuned without touching logic.

### 6.7 Screenshot naming

```
qa/screenshots/{scenario}-{viewport}-{seed}[--{step}].png
# examples:
arena-desktop-s42.png
play-card-mobile-s1--after.png
endoverlay-victory-landscape-s1337.png
reducedmotion-arena-tablet-s42.png
```

### 6.8 Reporting

- **Terminal:** live PASS/FAIL table per check, summary line `X passed / Y failed / Z warnings` per scenario, plus environment notes.
- **`qa/reports/report.json`:** machine-readable — schema below.
- **`qa/reports/report.md`:** human-readable — sections per scenario with embedded screenshot links (`![](../screenshots/...)`), console event lists, assertion table, known-issue deltas.

```jsonc
// report.json
{
  "meta": { "date": "…", "server": "…", "chrome": "…", "node": "…" },
  "scenarios": [
    {
      "name": "arena",
      "viewport": "desktop",
      "seed": 42,
      "checks": [ { "name": "A2-flex-direction", "pass": true, "detail": "column" } ],
      "console": [ { "level": "warn", "source": "console", "text": "…" } ],
      "screenshots": ["qa/screenshots/arena-desktop-s42.png"]
    }
  ],
  "summary": { "passed": 0, "failed": 0, "warnings": 0 }
}
```

---

## 7. Phase 2 — `?test=` Hook in `js/game.js` (minimal, guarded)

A tiny, self-contained block — no-op in normal play; activates only when `?test=1` is in the URL. Must not alter gameplay for real users.

### 7.1 Parameters

| Param | Effect |
|---|---|
| `test=1` | Enables the hook |
| `screen=arena` | Auto-advance splash → home → arena on load |
| `seed=<n>` | Override `Math.random` with a deterministic PRNG (mulberry32) before `drawHand()` — reproducible hands across viewports/runs |
| `intent=attack\|defend\|buff` | Force `enemy.intent` after `initGame()` (exercises all three intent UIs) |
| `outcome=victory\|defeat` | Call `showEndOverlay(...)` directly after `initGame()` (skips natural play) |
| `reduced=1` | Inject `prefers-reduced-motion: reduce` via CDP instead (harness-side, preferred) |

### 7.2 Rules for the hook

- Lives in one clearly-marked block (e.g. `// ── QA TEST HOOK (harmless in production) ──`) guarded by `const QA = new URLSearchParams(location.search).get("test");`.
- The RNG seed must be installed **before** any `Math.random()` call in `drawHand()`.
- Forced-state paths must still call `updateUI()` / `updateEnemyIntent()` so assertions see consistent DOM.
- Hook must not fire audio, timers, or animations that make the harness flaky.

---

## 8. Phase 3 — Manual Checklist (`qa/MANUAL-CHECKLIST.md`)

**Status: ✅ complete.** All 10 items were driven through real (headless) Chromium via
`qa/drive-checklist.mjs` (synthetic hover/press/Tab/Enter/Space/Escape, computed styles,
screenshots; evidence in `qa/reports/checklist-drive.json`). Result: **10/10 items PASS,
44/44 probe checks, 0 console errors** — with one genuine defect found and fixed (F1,
see §10). Subjective residue (audio feel, texture subtlety) is flagged per item for a
quick human glance.

Items automation can't faithfully judge; filled by the developer with pass/fail/notes:

1. **Card hover** — lift `translateY(-16px)` + holographic shimmer; **top of card not clipped** by the hand container (regression check for the `pt-7` fix).
2. **Glitch title** — RGB-split flicker on the SYNTACK splash title; respects reduced-motion.
3. **Button press depth** — Balatro-style 3D buttons collapse on `:active` without layout shift.
4. **Felt table + scanlines** — texture subtlety, CRT scanlines not overpowering.
5. **Terminal cursor** — blue blinking cursor; logs auto-scroll; brackets don't scroll away (regression).
6. **Floating damage numbers** — pixel-font numbers rise and fade from correct positions.
7. **Audio** — victory jingle plays on win (needs a first user click to unlock context); mute + volume slider sync between home and arena; `aria-pressed` toggles.
8. **Focus/keyboard** — Tab order follows visual order; Escape closes each modal; focus trap holds inside; Enter/Space plays a card; `:focus-visible` rings visible.
9. **Scrollbars & selection** — styled scrollbars on terminal/hand/modals; cyan selection color.
10. **375px + landscape smoke** — no horizontal page scroll, no content clipped behind fixed elements.

---

## 9. Acceptance Criteria (definition of done)

| Gate | Criterion | Status (2026-08-07, final code) | Evidence |
|---|---|---|---|
| **G1** | `node qa/run.mjs` completes end-to-end across all viewports × seeds without crashing the harness | ✅ | `qa/reports/report.json` — 108 scenarios, 0 errored, finished in ~141 s |
| **G2** | All arena assertions (6.5) pass on every viewport; specifically A1/A2 pass on all four | ✅ | A1/A2 pass 24/24 (all 4 viewports × 3 seeds); full battery 12/12 per arena scenario |
| **G3** | Zero FAIL-severity console/network entries; WARN/ENV entries logged and explained | ✅ | 0 console FAILs; 213 WARNs — all known noise (favicon 404 + Tailwind CDN prod warning) |
| **G4** | Reduced-motion pass shows layout intact with animations effectively disabled | ✅ | R1 12/12 (`animation-duration ≈ 1e-05s`); drive sampled static glitch under `reduce` |
| **G5** | Keyboard & focus flow checks pass (modal open/close/trap, Escape, Enter/Space) | ✅ | M2/M3 12/12 + drive item 8 7/7 (Tab trap, Enter/Space play, `:focus-visible`) |
| **G6** | `qa/reports/report.json` + `report.md` generated with screenshots; terminal summary clean | ✅ | both files regenerated; 151 screenshots; summary 108/108 |
| **G7** | Manual checklist completed with all items marked; any "no" items become findings | ✅ | `qa/MANUAL-CHECKLIST.md` — all `[x]`; F1 (the one "no") registered and fixed |

---

## 10. Known-Issue Log (living log — statuses updated as fixes land)

| # | Issue | Severity | Status (2026-08-10) | Evidence |
|---|-------|----------|----------------------|----------|
| K1 | Hand stagger animation runs while `#game-screen` is still `display:none` — `initGame()` runs before the screen transition reveals the arena, so the entry deal-in completes invisibly | Cosmetic (core feel) | ✅ **Fixed** — `animateScreenTransition` gained an `onComplete` callback; `btnMenuStart.onclick` defers `initGame()` until the transition (swap → fade-in → cleanup) finishes | `js/motion.js`, `js/game.js` |
| K2 | Motion CDN (`cdn.jsdelivr.net`) was a hard top-level import — if unreachable, `motion.js` and `game.js` fail to load and the **entire game is dead** | Robustness (worst failure mode) | ✅ **Fixed** — Motion vendored to `vendor/motion.esm.js` (self-contained 10.18.0 bundle); game boots and plays with jsdelivr blocked | `vendor/motion.esm.js`, `js/motion.js` |
| K3 | Tailwind Play CDN scans classes at runtime — fine for dev, but a production build should precompile | Dev-only | **Accepted** — game is played online with the CDN; no precompile planned (user decision 2026-08-10) | `index.html` |
| K4 | `<html lang="id">` but all content is English — screen-reader mismatch | Low (a11y) | ✅ **Fixed** — `lang="id"` → `lang="en"` | `index.html` |
| K5 | Untracked `server.pid` file from the preview server — should be gitignored | Housekeeping | ✅ **Resolved** — `.gitignore` now covers `server.pid` (plus qa artifacts) | `.gitignore` |
| K6 | `css/styles.css` section numbering skips 13 (comment-only) | Cosmetic | ✅ **Resolved** — section 13 is now the BATTLE FX block; numbering runs 1–20 continuously | `css/styles.css` |
| K7 | QA harness never exits after finishing: Chrome/Brave helper processes inherit the piped `stderr`, so Node's event loop stays open forever; and killing only the launched wrapper binary orphans the real browser process | Harness robustness | ✅ **Fixed** — `launchChrome` spawns `detached` + unrefs child/stderr; new `killChrome()` SIGKILLs the whole process group; all harness scripts use it | `qa/lib/cdp.mjs`, `qa/run.mjs`, `qa/drive-checklist.mjs`, `qa/visual-regress.mjs`, `qa/a11y.mjs` |
| F1 | Card hover lift was dead — `animateHandStagger()` left an inline `transform: translateY(var(--motion-translateY)) scale(var(--motion-scale))` on every hand card, overriding `.card:hover`; cards glowed but never lifted (same class of bug in `animateInsufficientRam`) | Medium (core feel) → **fixed** | Drive item 1 pre-fix: hovered=true, computed transform identity; `qa/reports/checklist-drive.json` |

**Resolved 2026-08-10** (validated by the full QA matrix under Brave — 88/88 scenarios,
552/552 checks, 0 console FAILs, natural process exit, zero orphaned browsers):

- **K1** — `animateScreenTransition` fires `onComplete` exactly once on all four exit paths;
  `initGame()` is deferred so the hand deal-in plays on a visible arena (no harness timing
  impact — `enterArena()` already waits for the hand to populate).
- **K2** — Motion vendored; verified by booting the game with `cdn.jsdelivr.net` blocked via
  CDP `--host-resolver-rules`: 5 hand cards render, card play animates, 0 uncaught exceptions,
  zero jsdelivr requests. (The jsdelivr `+esm` shim was not self-contained — it re-exports
  other jsdelivr URLs — so the esm.sh prebuilt single-file bundle was used; MIT license text
  is appended in `vendor/motion.esm.js`.)
- **K4** — `lang` corrected.
- **K7** — `proc.unref()` + `proc.stderr.unref()` stop the inherited pipe from holding the
  event loop; `detached: true` makes the child its own process-group leader so
  `process.kill(-pid)` takes down the whole browser tree (wrapper → real binary → helpers).

K3 is accepted as-is (dev-only runtime CSS scanning; the game is played online — no precompile planned).

F1 was **found by the drive run** (the exact bug-hunting outcome this system was built
for) and fixed in `js/motion.js`: the stagger/shake cleanups clear inline
`transform`/`opacity` on completion, and `animateCardPlay` sets a `data-playing` marker
that the stagger cleanup skips (so a card played mid-stagger isn't frozen). Drive
re-verified 4/4 on item 1; full matrix 108/108.

These are logged so the bug-hunting harness doesn't re-report them as new findings.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CDP WebSocket client bugs (no deps) | Keep `lib/cdp.mjs` minimal (~150 lines); test against the already-verified headless Chrome launch |
| `--virtual-time-budget` vs real-time waits for transitions | Use CDP `Runtime.evaluate` + polling for expected DOM state (e.g. wait for `#game-screen` `display:flex`) instead of fixed sleeps |
| Screenshot flakiness from the random hand | Multiple-seed runs + hook-seeded determinism; assertions target structure, not card content |
| Audio/autoplay warnings polluting results | Pattern-based WARN classification (6.6) |
| The `?test=` hook accidentally shipping | Guarded block + acceptance gate: a normal (non-`?test`) run behaves identically to before |
| Harness slowness (12 scenario/viewport/seed combos) | Scenario selection flags; each scenario is independently skippable |
| Hook probe flake on cold CDN (Phase 2): first load can exceed the 15 s `readyState` wait, so a fixed 1.5 s sleep misreported the hook as unavailable (24 scenarios skipped once) | Probe now **polls** `#game-screen` flex state via `waitFor` (10 s) instead of a fixed sleep — no false negatives, no false positives (the hook is the only path that flexes the screen on `?test=1`) |

---

## 12. Extended Tooling & Future Work

Two §12 candidates were built after the phases shipped (2026-08-07):

| Tool | Purpose | Status | Evidence |
|---|---|---|---|
| `qa/visual-regress.mjs` + `qa/lib/png.mjs` | Golden-image regression: deterministic baselines (reduced-motion + seeded hook) diffed with tolerance-based pixel comparison (`--tolerance`, `--max-delta`; red-overlay diff images in `qa/reports/visual-diffs/`) | ✅ built & verified | 7-shot capture → pixel-perfect re-compare (0 diff px, maxΔ ≤ 6); capture awaits `fonts.ready` (raced against 6 s) so cold-network font loading can't corrupt baselines; injected-stripe test detected exactly (25600 px, maxΔ 255); **2026-08-10:** baselines re-captured on the fixed code (fingerprint `c8eef0a980df`) → re-compare **7/7 PASS, 0 diff px, maxΔ 0** on every shot |
| `qa/a11y.mjs` | axe-core (jsDelivr 4.x) injected via CDP, audited across 7 screens → `qa/reports/a11y.json` | ✅ built, run, **findings fixed** | **7/7 screens → 0 violations** (was 0 critical · 2 serious · 12 moderate). Fixes: sticker contrast (`.rare` bg `#6234b2`, `.common` text `#e2e6f5`), `#archive-cards-list` got `tabindex="0"` + `role="list"`, single `<main>` landmark, h1s on home/arena (arena h1 placed inside the HUD section so `#game-screen` keeps 5 direct children — harness check A3), modal titles `h3`→`h2` (heading order); **2026-08-10:** re-audited — **8/8 screens (incl. reward-overlay) → 0 violations each** (0 crit / 0 ser / 0 mod / 0 min) |

> **2026-08-10 full-green-pass round:** both extended tools re-validated on the final code under
> Brave (`CHROME_BIN=/usr/bin/brave-origin`). Visual-regress: baselines refreshed (fingerprint
> `c8eef0a980df`) → **7/7 PASS with 0 diff px, maxΔ 0** across splash, home, arena (desktop/mobile/
> landscape), intents-attack, end-overlay-victory. A11y: axe audit across **8 screens** — splash, home,
> arena, archive-modal, rules-modal, end-overlay (victory + defeat), reward-overlay → **0 violations
> each**; `qa/reports/a11y.json` written. Both suites exit 0 naturally with **zero orphaned browsers**
> (K7 group-kill holds for all harness consumers). One note: the first a11y run hit a transient
> reward-overlay hook timeout (the §11 cold-CDN hook-probe flake class) — clean on immediate re-run;
> hook navigations in `qa/a11y.mjs` now retry once via a `navigateToHook` guard, so a cold-load
> flake can no longer fail a run.

**Remaining future work (not done):**

- CI integration (GitHub Actions job serving the game and running `run.mjs` + `drive-checklist.mjs` + `visual-regress.mjs` on push).
- ~~Tailwind Play CDN precompile / local fallback~~ — see K3 (Motion was vendored 2026-08-10, K2 ✅; Tailwind remains the only page-level CDN dependency — **accepted 2026-08-10**, game is played online).
