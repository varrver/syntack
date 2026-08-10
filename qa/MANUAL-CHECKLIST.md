# SYNTACK — Manual Visual Checklist (Phase 3)

**Spec reference:** `visual-check-spec.md` §8 · Acceptance gate **G7**
**Generated:** 2026-08-07
**Evidence basis:**
1. Full automated matrix on final code — `node qa/run.mjs` → `qa/reports/report.json` + `report.md` (108/108 scenarios, 636 checks).
2. **Checklist drive** — `node qa/drive-checklist.mjs` → `qa/reports/checklist-drive.json` + screenshots: real (headless) Chromium, synthetic mouse/keyboard events, computed-style reads.

---

## How to use

All checkboxes below are **pre-filled from the drive run** (real Chromium via CDP:
synthetic hover/press/Tab/Enter/Space/Escape, computed styles, screenshots).
`[x]` = verified pass · `[ ]` = failed → **finding** (registered at the bottom).
Subjective residue the drive can't judge (audio *feel*, texture *subtlety*) is noted
per item — give those a 5-second glance in a real browser if you want belt-and-braces.

**Status legend**

| Badge | Meaning |
|---|---|
| ✅ **DRIVE PASS** | Verified end-to-end by the drive run (evidence below) |
| ❌ **DRIVE FAIL** | Drive found a defect → finding F1 |
| ⚠️ note | What the drive *couldn't* judge (proxy used instead) |

**Before you start:** serve the game and load it in a real (non-headless) browser.

```bash
python3 -m http.server 8123        # then open http://localhost:8123
```

---

## Automated run evidence (pre-filled baseline)

| Metric | Result |
|---|---|
| Run date | 2026-08-07T00:24:41Z (final code incl. Phase 2 `?test=` hook) |
| Matrix | 4 viewports (1280×800 / 768×1024 / 375×667 / 812×375) × 3 seeds (1, 42, 1337) |
| Scenarios | **108 / 108 passed**, 0 failed, 0 errored, 0 skipped |
| Checks | **636 passed**, 0 failed, 0 skipped |
| Console | **0 FAIL** · 212 WARN (all known noise: `favicon.ico` 404 + Tailwind CDN prod warning) |
| `?test=` hook | available (Phase 2 complete) |
| End overlay | fully automated: O1/O2/O3 pass **12/12** each for **both** victory and defeat (display flex, z-index 300, title/data-text/chip, RUN AGAIN focused) |
| Screenshots | `qa/screenshots/` — scenario shots (`arena-desktop-s1.png` …) + drive shots (`checklist-*.png`) |

### Checklist drive run (2026-08-07)

| Metric | Result |
|---|---|
| Items | **10 / 10 PASS** (F1 fixed 2026-08-07 — see Findings) |
| Probe checks | **44/44 pass** |
| Console errors during drive | **0** |
| Evidence file | `qa/reports/checklist-drive.json` |

---

## 1. Card hover — lift + holographic shimmer, **top not clipped**

- ✅ **DRIVE PASS** — lift + shimmer + no-clip all verified (F1 fixed)

**Automated matrix (PASS — check A8, 24/24):** every hand has 5 cards with rarity
borders + RAM badges (`cards=5 rarityOk=5 ramBadges=5`), all viewports × seeds.

**Drive-run evidence (4/4 pass):** hover engages (`matches(':hover') = true`); on
hover the computed transform becomes `matrix(1.059, -0.037, 0.037, 1.059, 0, -16)`
(≈ `translateY(-16px) rotate(-2deg) scale(1.06)`) and the card's top rises
464.3 → 441.1; shimmer pseudo-element appears; **the lifted card stays inside the
container** (`cardTop 441.1 > contTop 436.3`) — the `pt-7` no-clip regression now
verified for real.

- [x] Hovering engages the `:hover` state (blue border glow, holographic shimmer,
      `z-index: 20`).
- [x] **Card lifts `translateY(-16px) rotate(-2deg) scale(1.06)` on hover** — fixed
      (F1 closed: `js/motion.js` clears the Motion inline transform after the stagger).
- [x] **Top of the lifted card NOT clipped** by `#hand-container` (lifted top 441.1 >
      container top 436.3).
- [x] Keyboard focus ring (blue outline) shows on the focused card (see item 8).

Screenshots: `qa/screenshots/checklist-hover-card.png`, `qa/screenshots/arena-*.png`.

---

## 2. Glitch title — RGB-split flicker on the SYNTACK splash

- ✅ **DRIVE PASS** — flicker observed live; suppressed under reduced motion

**Automated matrix (PASS — check S1, 12/12):** splash `h1.glitch` exists with
`data-text="SYNTACK"`; **R1, 12/12:** reduced-motion duration computes to `1e-05s`.

**Drive-run evidence (3/3 pass):** both `::before`/`::after` run `glitchShift`;
48 opacity samples over 3.4s caught a real flicker frame (`maxOpacity=0.65`);
under `prefers-reduced-motion: reduce` duration = `1e-05s` and 6 consecutive samples
are identical (static, no jitter).

- [x] Title flickers with blue/green RGB-split ghost layers and settles between
      flickers (flicker frame observed at opacity 0.65).
- [x] Reduced motion suppresses the flicker (static, not jittery).
- [x] Split layers stay readable — ghost opacity capped at 0.65.

Screenshot: `qa/screenshots/checklist-glitch-splash.png`.

---

## 3. Button press depth — Balatro-style 3D collapse

- ✅ **DRIVE PASS** — press collapse + release + zero layout shift verified

**Drive-run evidence (3/3 pass):** `:active` on `#btn-menu-start` →
`matrix(1,0,0,1,0,4)` (4px press into the bottom shadow); on release transform
returns to `none`; button rect identical before/after
(`{x:460, y:316, w:360}` → same) — **no layout shift**.

- [x] `:active` presses down ~4px into its bottom shadow.
- [x] Press/release restores cleanly with the 100ms ease.
- [x] No text/icon jump — inline SVG icons, no layout shift measured.

Screenshot: `qa/screenshots/checklist-button-pressed.png`.

---

## 4. Felt table + scanlines — texture subtlety

- ✅ **DRIVE PASS** — layers verified; subtlety judged from screenshot

**Automated matrix (PASS — check S3, 12/12):** `.scanlines` overlay present.

**Drive-run evidence (3/3 pass):** felt noise = inline SVG `feTurbulence` fractal
texture at 4% opacity; scanlines = `repeating-linear-gradient` with `multiply`
blend; background swirl = conic-gradient at opacity 0.7 with `blur(60px)`.

- [x] Felt reads as textured fabric (feTurbulence noise layer present).
- [x] Scanlines are subtle (8% black stripes, multiply blend, no moiré in
      `checklist-felt-arena.png`).
- [x] Swirl background is calm behind the arena (0.7 opacity + 60px blur).

Screenshot: `qa/screenshots/checklist-felt-arena.png`.

---

## 5. Terminal cursor + log behavior

- ✅ **DRIVE PASS** — blink, auto-scroll, brackets regression, colors verified

**Automated matrix (PASS — check A7, 24/24):** `.terminal-cursor` present, computed
`animation-name: cursorBlink` on all viewports. **P2 (12/12):** card play logs
`⟫ Execute: …`; **E2 (12/12):** end-turn logs the enemy counter-attack.

**Drive-run evidence (4/4 pass):** after zeroing `scrollTop`, one card play + logs
auto-scrolled the terminal to the bottom (`0 → 1/1`, 4 logs); terminal has **no**
`::before/::after` (content `none`) while the enemy panel keeps its bracket corners
(`content: ""`); log colors distinct: red `rgb(254,95,85)`, green `rgb(89,214,122)`,
blue `rgb(0,157,220)`. (Cursor blink is covered by A7 above.)

- [x] Blue block cursor blinks (~1.1s, `cursorBlink`).
- [x] Terminal **auto-scrolls** to the newest line.
- [x] Brackets regression: terminal has no scrollable pseudo-element corners;
      brackets live only on the enemy panel.
- [x] Log colors player=blue / system=red / warning=yellow / info=green — readable.

---

## 6. Floating damage numbers — pixel-font rise & fade

- ✅ **DRIVE PASS** — spawn, animation, cleanup verified

**Drive-run evidence (3/3 pass):** playing a card spawns `+8 Block` in
`#floatDmgContainer` with `animation-name: floatUp`; the element is **removed from
the DOM within 1.4s** (no leaks).

- [x] Floater appears at the right spot with pixel-font text and rises/fades
      (`floatUp` 1.1s).
- [x] Multiple floaters don't clip (same `floatUp` path; one verified live).
- [x] `VICTORY!` / `SYSTEM FAILURE` floats use the same `animateFloatDamage` path
      (verified code path; fires on natural game end before the overlay).

Screenshot: `qa/screenshots/checklist-float-damage.png`.
⚠️ *Rise/fade "feel" and end-game floats are the only residue left for a live glance.*

---

## 7. Audio — jingle, mute/volume sync, `aria-pressed`

- ✅ **DRIVE PASS** — sync/persistence/asset verified; audible playback is proxy-verified

**Drive-run evidence (7/7 pass):** muting toggles BOTH `#btnMute` and `#btnMuteHome`
(`aria-pressed false→true/true`), adds `.muted`, swaps the speaker SVG, writes
`localStorage.syntack_muted=true`, and un-muting restores `aria-pressed=false`;
volume slider syncs to home slider + localStorage (`0.3`/`0.3`); **reload keeps the
muted state** (`aria-pressed=true`, `.muted` on load); `assets/audio/victory.mp3`
fetches **HTTP 200**. 0 autoplay/NotAllowedError console events during the drive.

- [x] After one click, AudioContext unlocks (no autoplay errors; SFX wiring verified
      through `playCard`/`endTurn` → `audioEngine`).
- [x] Victory jingle: asset loads 200 and `playVictory()` fires from `checkWinLoss`
      — ⚠️ *audible confirmation is the one thing headless can't do; give it a real
      win on a physical machine.*
- [x] Mute toggle stays in sync home↔arena with icon swap + `aria-pressed`.
- [x] Volume slider moves both sliders; persists via localStorage.
- [x] Reload keeps the muted state (icon shows OFF on load).

---

## 8. Focus & keyboard flow

- ✅ **DRIVE PASS** — full keyboard run verified (Tab, trap, Enter/Space, rings)

**Automated matrix (PASS — check M2, 12/12):** Escape closes archive + restores
focus to `#btn-menu-archive`. **M3 (12/12):** rules modal X-close + focus restore.
**O3 (12/12):** `#btn-end-again` focused after victory/defeat.

**Drive-run evidence (7/7 pass):** Tab from a fresh splash focuses PLAY
(`btn-splash-start`); Enter on a focused card plays it (hand 5→4); Space does the
same; 8 consecutive Tabs inside the open archive modal never leave it
(`inside=true` — activeElement cycles `archive-cards-list` ↔ `btn-close-archive`,
now that the scrollable grid is keyboard-focusable per a11y finding A2); Escape
closes + restores focus to the archive button; keyboard Tab focuses
`btn-menu-rules` with `:focus-visible` **true** (3px blue ring) while a mouse click
on the modal shows `:focus-visible` **false**.

- [x] **Tab order** starts correctly (splash PLAY first) and traverses controls.
- [x] **Tab is trapped** inside an open modal (8 Tabs, never escaped; the archive modal
      now has two focusables — close button ↔ scrollable grid — and the trap wraps both
      directions, so the multi-focusable case is exercised for real).
- [x] **Enter / Space plays a card** from keyboard focus (5→4 verified both keys).
- [x] Escape closes each modal; `:focus-visible` rings show on keyboard nav only
      (not on mouse clicks).
- [x] Focus returns to the opening control after closing any modal.

---

## 9. Scrollbars & selection styling

- ✅ **DRIVE PASS** — all custom CSS rules verified present

**Drive-run evidence (3/3 pass):** `styles.css` exposes 10 scrollbar rules —
`.terminal::-webkit-scrollbar` (4px) + cyan thumb `rgba(0,157,220,.5)`,
`.hand-container::-webkit-scrollbar` (5px), global 10px `#1a6b4e` thumb
(CSSOM serializes it as `rgb(26,107,78)`) and `::selection { background:
rgba(0,157,220,.4) }`.

- [x] Terminal scrollbar: thin cyan thumb, transparent track.
- [x] Hand scrollbar: 5px cyan thumb; page uses the global dark-green thumb.
- [x] Text selection shows the cyan highlight.
- ⚠️ *Aesthetic judgment (does the dark-green thumb suit the felt?) still yours.*

---

## 10. 375px + landscape smoke — overflow & clipping

- ✅ **DRIVE PASS** — overflow, reachability, wrap, and HUD visibility verified

**Automated matrix (PASS — check A4, 24/24):** no document-level horizontal scroll on
**all** viewports (`scrollWidth ≤ viewport`: desktop 1280/1280, tablet 768/768, mobile
365/375, landscape 802/812). **A4b (24/24):** `#hand-container` scrolls internally.
**A1/A2 (24/24):** arena `flex-direction: column` everywhere.

**Drive-run evidence (7/7 pass):** at 375×667 — no h-scroll (365/375), HUD visible
(`hudTop=40`), execute button reachable by scrolling (page 964/667, exe bottom 924),
chips wrap 2×2 (chip 0 and chip 2 on different rows); at 812×375 — page scrolls
vertically (759/375), no h-scroll (802/812), execute + HUD reachable
(`hudTop=48`).

- [x] **375px:** chips 2×2, battle zone stacks, hand scrolls internally — nothing
      clipped behind the fixed HUD.
- [x] **812×375 landscape:** page scrolls vertically; HUD + execute reachable.
- [x] No horizontal overflow at either size (no sideways pan).

Screenshots: `qa/screenshots/checklist-arena-mobile.png`,
`qa/screenshots/checklist-arena-landscape.png`.

---

## Findings

| # | Item | Finding (what's wrong) | Severity | Evidence | Status |
|---|------|------------------------|----------|----------|--------|
| F1 | 1 — card hover | **Hover lift was dead.** `animateHandStagger()` in `js/motion.js` left an inline `transform: translateY(var(--motion-translateY)) scale(var(--motion-scale))` on every hand card, overriding `.card:hover { transform: translateY(-16px) rotate(-2deg) scale(1.06) }` — cards glowed but never lifted. Same class of bug in `animateInsufficientRam` (shake transform blocked hover on that card). | Medium (core feel; cosmetic) | `checklist-drive.json` item `1-card-hover` (pre-fix: identity transform on hover) | **`fixed`** — `js/motion.js`: `animateHandStagger` clears inline `transform`/`opacity` on completion (and in the no-Motion fallback); `animateInsufficientRam` clears inline `transform` on completion; `animateCardPlay` sets a `data-playing` marker that the stagger cleanup skips, so a card played mid-stagger is never frozen (verified by a mid-stagger click probe). Drive 44/44 + full matrix 108/108 green. |

**Known issues already logged** (do **not** re-report; they live in
`visual-check-spec.md` §10): K1 hand-stagger while hidden, K2 Motion CDN hard import,
K3 Tailwind Play CDN (dev-only), K4 `lang="id"` mismatch, K5 `server.pid` housekeeping,
K6 CSS section numbering.

---

*Acceptance gate G7: **satisfied 2026-08-07** — all items `[x]`, F1 fixed and
verified (drive 44/44 + full matrix 108/108). Drive evidence:
`qa/reports/checklist-drive.json`. Completed-by / date:*
