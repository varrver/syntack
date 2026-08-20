# AGENTS.md — SYNTACK

Cyberpunk browser deckbuilder card game. Vanilla JS (ES modules), no build step, no npm.

## Run

```sh
python3 -m http.server 8123          # serve from project root
```

## QA (requires Node ≥ 20 + Chrome/Brave)

```sh
CHROME_BIN=/usr/bin/brave-origin node qa/run.mjs              # full test matrix
CHROME_BIN=/usr/bin/brave-origin node qa/a11y.mjs             # accessibility audit
CHROME_BIN=/usr/bin/brave-origin node qa/visual-regress.mjs   # golden-image regression
node --check js/*.js                                           # syntax check (no linter)
```

QA reports land in `qa/reports/` (gitignored). QA harness uses Chrome DevTools Protocol directly — zero npm deps.

## Architecture

Entry point: `index.html` loads `js/game.js` via `<script type="module">`.

```
js/game.js        ← orchestrator: wires modules, card play, hand draw
js/state.js       ← mutable let objects (player, enemy, run, hand) + constants
js/cards.js       ← 10 card type definitions + action functions
js/combat.js      ← damage dealing, enemy turns, win/loss
js/renderer.js    ← DOM rendering: terminal log, hand cards, HUD updates
js/motion.js      ← all animations (largest file, 560+ lines)
js/navigation.js  ← screen transitions, modal open/close, focus trapping
js/reward.js      ← reward overlay + end-game overlay
js/audio.js       ← Web Audio API synth engine (zero audio files except victory.mp3)
js/audio-ui.js    ← mute toggle, volume sliders
js/icons.js       ← SVG icon set
js/qa-hook.js     ← deterministic RNG + URL param forcing (inert unless ?test=1)
vendor/motion.esm.js  ← vendored motion@10.18.0 — DO NOT EDIT
css/styles.css    ← Balatro design system (~880 lines)
```

## Conventions

- **No build step.** Native ES module imports. No transpilation, bundling, or minification.
- **Tailwind via CDN** (`cdn.tailwindcss.com`). Config is inline in `index.html`. Classes are scanned at runtime.
- **Color tokens live in CSS.** `css/styles.css` `:root` has hex + RGB triplets. Tailwind palette in `index.html` bridges via `rgb(var(--x-rgb) / <alpha-value>)`. Never use raw hex in Tailwind classes.
- **State mutation.** `player`, `enemy`, `run`, `hand` are mutable `let` objects exported from `state.js`. Modules mutate properties directly. Setter functions (`setGameOver`, `setIsAnimating`, etc.) exist for values that get reassigned.
- **Card damage callback.** Card `action` functions receive `dealDamageToEnemy` as a callback to avoid circular imports between `cards.js` ↔ `combat.js`.
- **Reduced motion.** `motion.js` checks `REDUCED_MOTION` constant. CSS has `@media (prefers-reduced-motion: reduce)` rule. Both paths must be considered when adding animations.
- **Accessibility enforced.** Single `<main>` landmark, `aria-pressed` on mute, `role="dialog"` + `aria-modal` on overlays, focus trapping in modals, keyboard nav (Tab/Enter/Space/Escape).
- **QA test hook.** `?test=1&screen=arena&seed=N` in URL activates deterministic PRNG and screen forcing via `js/qa-hook.js`. Inert in normal play.
- **CSS sections.** `css/styles.css` uses numbered section comments (1–20). Keep new additions in the correct section order.
- **No linting/formatting tooling.** Only `node --check` for syntax. Follow existing code style.
