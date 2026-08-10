# SYNTACK — QA Wrap-up & Git Guide

**Date:** 2026-08-07 · **Status:** all automated checks green; spec marked complete
(`visual-check-spec.md`)

---

## 1. What shipped

### Game (4 files changed)

| File | Change |
|---|---|
| `index.html` | `balatro-*` colors added to the Tailwind config; emoji → inline SVG icons; contrast/aria fixes; end-overlay markup; screen containers fixed (`#game-screen` got `flex flex-col` — the arena was laid out as one horizontal row) |
| `css/styles.css` | design tokens, glitch effect, `.hidden` guard rule, focus rings, fallback animations, end-overlay styles |
| `js/game.js` | SVG icon set, end-overlay flow, keyboard card activation, modal focus management, **`?test=` QA hook** (mulberry32 seed / screen jump / forced intent & outcome) |
| `js/motion.js` | **F1 fix:** clear stale Motion inline transforms after the hand stagger & RAM-shake so `.card:hover` lift works again; `data-playing` marker so a card played mid-stagger isn't frozen |

### QA system (`qa/`, gitignored outputs only)

| Tool | Purpose |
|---|---|
| `qa/run.mjs` + `qa/lib/*` | Phase 1 CDP harness: 9 scenarios × 4 viewports × 3 seeds, computed-style assertions, console/network classification, JSON + Markdown reports |
| `qa/drive-checklist.mjs` | Phase 3: drives the 10 manual-checklist items in real (headless) Chromium |
| `qa/visual-regress.mjs` + `qa/lib/png.mjs` | Golden-image regression: deterministic baselines + tolerance pixel diff + red overlay |
| `qa/a11y.mjs` | axe-core audit across 7 screens |
| `qa/MANUAL-CHECKLIST.md` | all 10 items `[x]`, F1 registered + fixed |
| `qa/QA-WRAPUP.md` | this file |

### Spec
`visual-check-spec.md` — marked ✅ **Complete (Phases 1–3)**, G1–G7 evidence table, F1 in
the known-issue log, new tools documented.

---

## 2. Validation evidence (final code, 2026-08-07)

| Check | Result |
|---|---|
| Full harness matrix (`node qa/run.mjs`) | **108/108 scenarios, 636 checks, 0 FAIL** (213 known-noise WARNs) |
| Checklist drive (`node qa/drive-checklist.mjs`) | **10/10 items, 44/44 checks, 0 console errors** |
| Golden-image (`node qa/visual-regress.mjs`) | 7 shots pixel-perfect (0 diff px, maxΔ ≤ 6); cold-network font race hardened (`fonts.ready` awaited); diff detection proven (injected 20px stripe → exactly 25600 px, maxΔ 255) |
| Accessibility (`node qa/a11y.mjs`) | **0 violations across all 7 screens** — findings A1–A5 fixed (see §3) |
| JS syntax | `node --check` clean on all game + QA files |

---

## 3. Findings & fixes

### Accessibility (from `qa/reports/a11y.json`) — **all fixed 2026-08-07**

| # | Impact | Rule | Where | Fix applied |
|---|---|---|---|---|
| A1 | serious | `color-contrast` | splash rarity stickers `.rare` / `.common` | `.rare` bg `#8957e5` → `#6234b2` (white text now ≈7.9:1); `.common` text `#c5cbe0` → `#e2e6f5` (≈6.7:1) |
| A2 | serious | `scrollable-region-focusable` | `#archive-cards-list` | `tabindex="0"` + `role="list"` + `aria-label`; archive card children get `role="listitem"` (keyboard-scrollable) |
| A3 | moderate | `landmark-one-main` | all screens | single `<main class="w-full flex flex-col items-center">` wraps splash/home/game (layout-neutral) |
| A4 | moderate | `page-has-heading-one` | home / arena | home title `h2`→`h1`; arena gets a visually-hidden `h1` (placed inside the HUD section so `#game-screen` keeps its 5 sections — check A3 in the harness) |
| A5 | moderate | `region` | content outside landmarks | resolved by A3 — every flagged node now lives inside `<main>` |
| A6 | moderate | `heading-order` | modal titles | dialog titles `h3`→`h2` (h1 → h2, no skipped levels — surfaced once the screens had real h1s) |

**Verification:** `node qa/a11y.mjs` re-run on final code → **7/7 screens, 0 violations,
0 unique rule ids** (was 0 critical · 2 serious · 12 moderate). The harness matrix
(108/108, incl. arena-section check A3), checklist drive (10/10, focus trap still
holds with the new modal focusable), and golden images (7/7) all remain green.

### Known issues (pre-existing, in spec §10 — not re-fixed)
K1 hand-stagger while hidden · K2 Motion CDN hard import (game dead offline) · K3
Tailwind CDN dev-only · K4 `lang="id"` mismatch · K5 `server.pid` · K6 CSS numbering.

---

## 4. Git guidance

**Working tree:** `M css/styles.css M index.html M js/game.js M js/motion.js` +
untracked `qa/` + `visual-check-spec.md`.

**`.gitignore` already covers:** `qa/reports/`, `qa/screenshots/`, `qa/baselines/`,
`server.pid` — so committing `qa/` commits only source (`run.mjs`, `lib/*`,
`drive-checklist.mjs`, `visual-regress.mjs`, `a11y.mjs`, `MANUAL-CHECKLIST.md`,
`QA-WRAPUP.md`), never screenshots/reports/baselines.

**Suggested commits (one logical unit each):**

```bash
git add index.html css/styles.css js/game.js js/motion.js
git commit -m "fix(ui): restore arena column layout, SVG icons, contrast/a11y, end overlay"

git add js/game.js js/motion.js
git commit -m "fix(motion): clear stale inline transforms so card hover lift works (F1)"

git add qa/
git commit -m "test(qa): CDP harness + checklist drive + golden-image + axe audit"

git add visual-check-spec.md
git commit -m "docs: complete visual-check spec (phases 1-3, G1-G7, F1)"
```

> The `?test=` hook is URL-gated and inert in normal play — safe to ship.

---

## 5. Runbook

```bash
python3 -m http.server 8123                # prerequisite
node qa/run.mjs                            # full matrix → qa/reports/report.md
node qa/drive-checklist.mjs                # 10-item manual checklist drive
node qa/visual-regress.mjs --capture       # (re)build golden baselines
node qa/visual-regress.mjs                 # compare vs baselines
node qa/a11y.mjs                           # accessibility audit
```
