# SYNTACK — Cyber Deckbuilder

A cyberpunk coding deckbuilder where you hack the mainframe with programming-logic cards. Balatro-inspired visual language: felt table, holographic cards, CRT scanlines, glitch titles.

## Features

- **Code-themed cards** — `let x = 8`, `ATTACK(x)`, `for (2x Loop)`, `DEFENSE(8)`, `OVERCLOCK()`, and more
- **4-node campaign** — breach FIREWALL DAEMON → INTRUSION WRAITH → LOGIC BOMBER → MAINFRAME CORE, picking a reward between nodes
- **Best-run tracking** — deepest node reached persists in `localStorage`
- **Battle FX** — attack bolts, impact rings, crit numbers, enemy telegraph/lunge, damage-scaled hit audio (Web Audio API, zero audio files except the victory jingle)
- **Motion library vendored** (`vendor/motion.esm.js`) — the game works fully offline except for Tailwind + fonts (K3, accepted)
- **Accessible** — keyboard play, focus traps, visible focus rings, reduced-motion support, axe-core audited

## Project structure

```
index.html            # screens (splash / home / arena), modals, overlays
css/styles.css        # Balatro design system + utility colors
js/
  game.js             # runtime state, combat, screen manager, QA test hook
  config.js           # static game data (cards, enemy roster, intent styling)
  cards.js            # card DOM rendering (hand + archive, shared rarity styles)
  motion.js           # Motion-driven animations & micro-interactions
  audio.js            # Web Audio synth engine (tone/noise primitives)
vendor/motion.esm.js  # vendored motion@10.18.0 bundle (do not edit)
qa/                   # zero-dependency CDP QA harness (see below)
```

## Run locally

```bash
python3 -m http.server 8123        # from the project root
# open http://localhost:8123
```

No build step, no npm dependencies for the game itself.

## QA harness

The `qa/` directory contains a zero-dependency Chrome DevTools Protocol test suite (no npm installs needed; Node ≥ 20 with a global `WebSocket`).

```bash
# Full scenario matrix (all viewports × seeds). Needs a browser binary:
# CHROME_BIN=/usr/bin/brave-origin  (or point at any Chrome/Chromium)
CHROME_BIN=/usr/bin/brave-origin node qa/run.mjs

# Drive the manual checklist in headless Chrome
CHROME_BIN=/usr/bin/brave-origin node qa/drive-checklist.mjs

# Golden-image regression (capture baselines once, then compare)
CHROME_BIN=/usr/bin/brave-origin node qa/visual-regress.mjs --capture
CHROME_BIN=/usr/bin/brave-origin node qa/visual-regress.mjs

# Accessibility audit (injects axe-core; needs network)
CHROME_BIN=/usr/bin/brave-origin node qa/a11y.mjs
```

Reports land in `qa/reports/` (gitignored). The full spec lives in `visual-check-spec.md` (known-issue log K1–K7 + F1, acceptance criteria, QA results).
