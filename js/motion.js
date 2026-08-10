/**
 * SYNTACK — Motion & Micro-interaction Controller
 * Uses Framer Motion / Motion Engine for spring physics, screen transitions, and card animations.
 */

// Vendored locally (vendor/motion.esm.js) so the game works fully offline —
// the previous CDN import was a hard module-graph dependency: if jsdelivr was
// unreachable, motion.js (and therefore game.js) failed to load entirely (K2).
import { animate, spring, stagger } from "../vendor/motion.esm.js";

/* Battle FX honor prefers-reduced-motion: visual-only, so we skip them
   (still firing completion callbacks so game flow/state is unaffected).
   The golden-image suite runs with reduced-motion emulation, which keeps
   pixel captures deterministic. */
const REDUCED_MOTION =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Sequencing margin: every Motion-driven animation below is fire-and-forget,
   and its follow-up (cleanup, screen swap, onComplete) is a setTimeout at
   `duration + FX_MARGIN`. Motion's animate() in motion@10.18.0 returns a
   NON-thenable AnimationPlaybackControls, so .then() cannot be relied on. */
const FX_MARGIN = 20;

/* Micro-interaction timings (ms). Each Motion duration below is `MS / 1000`.
   The stagger total also accounts for its per-card delay. */
const TRANSITION_OUT_MS = 250; // screen fade-out (swap happens after this)
const TRANSITION_IN_MS = 350; // screen fade-in
const MODAL_CLOSE_MS = 200; // modal content shrink-out
const CARD_PLAY_MS = 350; // card fly-out
const FLOAT_MS = 1100; // floating damage number lifetime
const SHAKE_CARD_MS = 300; // insufficient-RAM card shake
const STAGGER_DURATION_MS = 350; // per-card deal-in
const STAGGER_STEP_MS = 60; // stagger delay between cards

export function animateScreenTransition(fromEl, toEl, onComplete) {
  if (!fromEl || !toEl) {
    if (onComplete) onComplete();
    return;
  }
  const done = () => {
    if (onComplete) onComplete();
  };
  const swap = () => {
    fromEl.classList.add("hidden");
    fromEl.classList.remove("flex");
    toEl.classList.remove("hidden");
    toEl.classList.add("flex");
  };
  if (REDUCED_MOTION) {
    swap();
    done();
    return;
  }
  let motionOk = true;
  try {
    animate(
      fromEl,
      { opacity: [1, 0], scale: [1, 0.95] },
      { duration: TRANSITION_OUT_MS / 1000 },
    );
  } catch (err) {
    motionOk = false;
  }
  // Swap after the fade-out, then fade the new screen in — sequenced by timer.
  setTimeout(
    () => {
      swap();
      if (!motionOk) {
        done();
        return;
      }
      try {
        animate(
          toEl,
          { opacity: [0, 1], scale: [0.92, 1] },
          {
            duration: TRANSITION_IN_MS / 1000,
            easing: spring({ stiffness: 300, damping: 20 }),
          },
        );
      } catch (err) {}
      // F1-class hygiene: Motion leaves an inline transform on the incoming
      // screen after the fade-in; clear it so the screen has no stale styles.
      // onComplete fires only after the whole transition (swap + fade-in) has
      // finished, so callers can run setup whose animations should be visible
      // (e.g. the hand deal-in in initGame — K1).
      setTimeout(() => {
        toEl.style.transform = "";
        toEl.style.scale = "";
        done();
      }, TRANSITION_IN_MS + FX_MARGIN);
    },
    motionOk ? TRANSITION_OUT_MS + FX_MARGIN : 0,
  );
}

export function animateModalOpen(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove("hidden");
  modalEl.classList.add("flex");

  const content = modalEl.querySelector(".modal-content");
  if (content && !REDUCED_MOTION) {
    try {
      animate(
        content,
        { opacity: [0, 1], scale: [0.85, 1], y: [30, 0] },
        { duration: 0.3, easing: spring({ stiffness: 350, damping: 22 }) },
      );
    } catch (e) {}
  }
}

export function animateModalClose(modalEl) {
  if (!modalEl) return;
  const hide = () => {
    modalEl.classList.add("hidden");
    modalEl.classList.remove("flex");
  };
  const content = modalEl.querySelector(".modal-content");
  if (!content || REDUCED_MOTION) {
    hide();
    return;
  }
  let motionOk = true;
  try {
    animate(
      content,
      { opacity: [1, 0], scale: [1, 0.9] },
      { duration: MODAL_CLOSE_MS / 1000 },
    );
  } catch (err) {
    motionOk = false;
  }
  setTimeout(hide, motionOk ? MODAL_CLOSE_MS + FX_MARGIN : 0);
}

export function animateHandStagger(container) {
  if (!container) return;
  const cards = container.querySelectorAll(".card");
  if (!cards || cards.length === 0) return;

  // F1: Motion leaves an inline transform (e.g. translateY(var(--motion-*))) on
  // each card when the animation ends, which overrides the stylesheet's
  // `.card:hover` lift. Clear the inline styles when the stagger finishes,
  // but skip a card that is mid-play (animateCardPlay marks it with
  // data-playing) so we don't freeze its play animation.
  const cleanup = () => {
    cards.forEach((card) => {
      if (card.dataset.playing === "true") return;
      card.style.transform = "";
      card.style.opacity = "";
    });
  };

  if (REDUCED_MOTION) {
    cleanup();
    return;
  }
  let motionOk = true;
  try {
    animate(
      cards,
      { y: [40, 0], opacity: [0, 1], scale: [0.85, 1] },
      {
        delay: stagger(STAGGER_STEP_MS / 1000),
        duration: STAGGER_DURATION_MS / 1000,
        easing: spring({ stiffness: 300, damping: 22 }),
      },
    );
  } catch (err) {
    motionOk = false;
  }
  // Last card starts at STAGGER_STEP*(n-1) and runs STAGGER_DURATION.
  const totalMs = STAGGER_DURATION_MS + STAGGER_STEP_MS * (cards.length - 1);
  setTimeout(cleanup, motionOk ? totalMs + FX_MARGIN : 0);
}

export function animateCardPlay(cardEl, onComplete) {
  if (!cardEl) {
    if (onComplete) onComplete();
    return;
  }

  // DOM marker: the hand-stagger cleanup (which fires after each render)
  // must leave this card's inline transform alone while it's playing, or it
  // would wipe Motion's transform template and freeze the play animation.
  cardEl.dataset.playing = "true";

  const finish = () => {
    delete cardEl.dataset.playing;
    if (onComplete) onComplete();
  };
  if (REDUCED_MOTION) {
    finish();
    return;
  }
  try {
    animate(
      cardEl,
      { y: [0, -40, 10], opacity: [1, 0.9, 0], scale: [1, 1.15, 0.8] },
      {
        duration: CARD_PLAY_MS / 1000,
        easing: spring({ stiffness: 350, damping: 25 }),
      },
    );
  } catch (err) {
    cardEl.classList.add("played"); // CSS cardPlay keyframes fallback
  }
  setTimeout(finish, CARD_PLAY_MS + FX_MARGIN);
}

export function animateInsufficientRam(cardEl) {
  if (!cardEl) return;
  if (REDUCED_MOTION) return;
  let motionOk = true;
  try {
    animate(
      cardEl,
      { x: [0, -8, 8, -6, 6, 0] },
      {
        duration: SHAKE_CARD_MS / 1000,
        easing: spring({ stiffness: 400, damping: 15 }),
      },
    );
  } catch (err) {
    motionOk = false;
    cardEl.classList.add("insufficient-ram");
    setTimeout(
      () => cardEl.classList.remove("insufficient-ram"),
      SHAKE_CARD_MS + 100,
    );
    return;
  }
  // Same F1 class: clear the shake's inline transform so the card's
  // `.card:hover` lift isn't overridden afterwards.
  setTimeout(() => {
    cardEl.style.transform = "";
    cardEl.style.scale = "";
  }, SHAKE_CARD_MS + FX_MARGIN);
}

/* FX timings (ms). Each Motion duration below is expressed as `MS / 1000` and
   the sequencing setTimeout as `MS + FX_MARGIN`, so the pairs can't drift apart. */
const SHAKE_MS = 300; // enemy hit shake
const LUNGE_MS = 460; // enemy lunge (impact at ~42% of it)
const RECOIL_MS = 220; // player hand recoil
const BOLT_MS = 340; // attack bolt flight

const IMPACT_AT_MS = Math.round(LUNGE_MS * 0.42); // lunge apex ≈ 195ms
const TELEGRAPH_MS = 280; // enemy windup glow before the lunge

export function animateEnemyDamage(enemyBoxEl) {
  if (!enemyBoxEl) return;
  // If the Daemon is mid-lunge (endTurn) the lunge owns the panel's transform;
  // skip the shake so two Motion animations never fight over the same element.
  if (enemyBoxEl.classList.contains("lunging")) return;
  if (REDUCED_MOTION) return;
  try {
    animate(
      enemyBoxEl,
      { x: [0, -3, 3, -2, 2, 0], scale: [1, 1.02, 0.99, 1] }, // subtle ~3px
      {
        duration: SHAKE_MS / 1000,
        easing: spring({ stiffness: 450, damping: 18 }),
      },
    );
  } catch (err) {
    enemyBoxEl.classList.add("attacking");
    setTimeout(() => enemyBoxEl.classList.remove("attacking"), SHAKE_MS + 100);
    return;
  }
  // Sequence with a timer (Motion's animate() is not reliably thenable across
  // environments — motion@10.18.0 returns a non-thenable AnimationPlaybackControls).
  setTimeout(() => {
    // F1-class cleanup: don't leave Motion's inline transform on the panel.
    enemyBoxEl.style.transform = "";
    enemyBoxEl.style.scale = "";
  }, SHAKE_MS + FX_MARGIN);
}

/* Pokemon-style enemy lunge: the Daemon charges toward the player's side,
   holds at the apex (impact moment, when `onImpact` fires), then recoils back. */
export function animateEnemyAttack(enemyBoxEl, onImpact, onComplete) {
  if (!enemyBoxEl) {
    if (onImpact) onImpact();
    if (onComplete) onComplete();
    return;
  }
  if (REDUCED_MOTION) {
    if (onImpact) onImpact();
    if (onComplete) onComplete();
    return;
  }
  enemyBoxEl.classList.add("lunging");
  try {
    animate(
      enemyBoxEl,
      { x: [0, -64, -64, 0], scale: [1, 1.07, 1.07, 1] },
      {
        duration: LUNGE_MS / 1000,
        times: [0, 0.42, 0.55, 1],
        easing: spring({ stiffness: 260, damping: 24 }),
      },
    );
  } catch (err) {
    // Motion unavailable — the CSS shake fallback still sells the strike.
    enemyBoxEl.classList.add("attacking");
  }
  // Impact lands at the lunge apex while it holds; timers (not .then) sequence
  // the FX — see animateEnemyDamage.
  setTimeout(() => {
    if (onImpact) onImpact();
  }, IMPACT_AT_MS);
  setTimeout(() => {
    enemyBoxEl.classList.remove("lunging");
    enemyBoxEl.classList.remove("attacking");
    enemyBoxEl.style.transform = "";
    enemyBoxEl.style.scale = "";
    if (onComplete) onComplete();
  }, LUNGE_MS + FX_MARGIN);
}

/* Enemy attack telegraph: a red threat glow + pull-back before the lunge.
   `onTelegraphDone` hands off to animateEnemyAttack so the windup visibly
   precedes the charge. Game state updates synchronously in endTurn; only the
   visuals are staged, so this is safe to skip under reduced motion. */
export function animateEnemyTelegraph(enemyBoxEl, onTelegraphDone) {
  if (!enemyBoxEl) {
    if (onTelegraphDone) onTelegraphDone();
    return;
  }
  if (REDUCED_MOTION) {
    if (onTelegraphDone) onTelegraphDone();
    return;
  }
  enemyBoxEl.classList.add("telegraphing");
  try {
    animate(
      enemyBoxEl,
      { scale: [1, 1.05], y: [0, -6] },
      {
        duration: TELEGRAPH_MS / 1000,
        easing: spring({ stiffness: 180, damping: 14 }),
      },
    );
  } catch (err) {
    // Motion unavailable — the CSS telegraph glow still reads as a windup.
  }
  setTimeout(() => {
    enemyBoxEl.classList.remove("telegraphing");
    if (onTelegraphDone) onTelegraphDone();
  }, TELEGRAPH_MS + FX_MARGIN);
}

/* Recoil kick on the player's hand when an attack card fires. */
export function animateHandRecoil() {
  const hand = document.getElementById("hand-container");
  if (!hand || REDUCED_MOTION) return;
  try {
    animate(
      hand,
      { x: [0, -4, 3, -2, 0] },
      {
        duration: RECOIL_MS / 1000,
        easing: spring({ stiffness: 500, damping: 18 }),
      },
    );
  } catch (err) {
    hand.style.transform = "";
    return;
  }
  setTimeout(() => {
    hand.style.transform = "";
    hand.style.scale = "";
  }, RECOIL_MS + FX_MARGIN);
}

/* Energy bolt: launches from the played card's last position (or the hand)
   and flies in an arc onto the enemy panel, spinning as it travels.
   `onImpact` fires the instant it lands (shake + flash + sound in game.js). */
export function animateAttackBolt(fromRect, targetEl, opts = {}) {
  const container = document.getElementById("floatDmgContainer");
  if (!container || !targetEl) {
    if (opts.onImpact) opts.onImpact();
    return;
  }
  if (REDUCED_MOTION) {
    if (opts.onImpact) opts.onImpact();
    return;
  }

  const t = targetEl.getBoundingClientRect();
  if (!t.width || !t.height) {
    if (opts.onImpact) opts.onImpact();
    return;
  }
  let sx, sy;
  if (fromRect && fromRect.width) {
    sx = fromRect.left + fromRect.width / 2;
    sy = fromRect.top + fromRect.height / 2;
  } else {
    const hand = document.getElementById("hand-container");
    const b =
      (hand && hand.getBoundingClientRect()) ||
      container.getBoundingClientRect();
    sx = b.left + b.width / 2;
    sy = b.top + b.height / 2;
  }
  const tx = t.left + t.width / 2;
  const ty = t.top + t.height / 2;
  const dx = tx - sx;
  const dy = ty - sy;

  const el = document.createElement("div");
  el.className = "fx-bolt";
  el.setAttribute("aria-hidden", "true");
  el.style.left = sx + "px";
  el.style.top = sy + "px";
  container.appendChild(el);

  try {
    animate(
      el,
      {
        x: [0, dx * 0.55, dx],
        y: [0, dy - 36, dy], // mid-flight arc overshoot, then drops onto the target
        scale: [1, 1.2, 0.25],
        rotate: [0, 320],
        opacity: [1, 1, 0.5],
      },
      // spring (not a string easing): Motion delegates string easings to WAAPI,
      // which rejects 'easeIn'/'easeOut' — springs are Motion-native and safe.
      {
        duration: BOLT_MS / 1000,
        times: [0, 0.55, 1],
        easing: spring({ stiffness: 300, damping: 26 }),
      },
    );
  } catch (err) {
    // Motion unavailable — a CSS pulse keeps the bolt visible as an effect.
    el.classList.add("fx-bolt-fallback");
  }
  // Sequence on a timer (Motion's animate() is not reliably thenable — see
  // animateEnemyDamage): the bolt flies for BOLT_MS, then lands.
  setTimeout(() => {
    el.remove();
    if (opts.onImpact) opts.onImpact();
  }, BOLT_MS + FX_MARGIN);
}

const FX_COLORS = {
  blue: "0,157,220",
  red: "254,95,85",
  green: "89,214,122",
  white: "255,255,255",
};

/* Impact feedback on a target: brief white flash overlay + expanding ring. */
export function animateHitFlash(targetEl, color = "white") {
  const container = document.getElementById("floatDmgContainer");
  if (!container || !targetEl || REDUCED_MOTION) return;
  const b = targetEl.getBoundingClientRect();
  if (!b.width || !b.height) return; // hidden target — nothing to flash
  const rgb = FX_COLORS[color] || FX_COLORS.white;

  const flash = document.createElement("div");
  flash.className = "fx-flash";
  flash.setAttribute("aria-hidden", "true");
  flash.style.left = b.left + "px";
  flash.style.top = b.top + "px";
  flash.style.width = b.width + "px";
  flash.style.height = b.height + "px";
  container.appendChild(flash);

  const ring = document.createElement("div");
  ring.className = "fx-ring";
  ring.setAttribute("aria-hidden", "true");
  ring.style.left = b.left + b.width / 2 + "px";
  ring.style.top = b.top + b.height / 2 + "px";
  ring.style.setProperty("--fx-color", `rgb(${rgb})`);
  container.appendChild(ring);

  setTimeout(() => {
    flash.remove();
    ring.remove();
  }, 560);
}

/* Bigger, slower double-ring burst for victory / defeat moments. */
export function animateBurst(targetEl, color = "white") {
  const container = document.getElementById("floatDmgContainer");
  if (!container || !targetEl || REDUCED_MOTION) return;
  const b = targetEl.getBoundingClientRect();
  if (!b.width || !b.height) return; // hidden target — nothing to burst
  const rgb = FX_COLORS[color] || FX_COLORS.white;

  animateHitFlash(targetEl, color);

  const ring = document.createElement("div");
  ring.className = "fx-ring fx-ring-lg";
  ring.setAttribute("aria-hidden", "true");
  ring.style.left = b.left + b.width / 2 + "px";
  ring.style.top = b.top + b.height / 2 + "px";
  ring.style.setProperty("--fx-color", `rgb(${rgb})`);
  container.appendChild(ring);

  setTimeout(() => ring.remove(), 850);
}
export function animateFloatDamage(text, type, left, top) {
  const container = document.getElementById("floatDmgContainer");
  if (!container) return;

  const FLOAT_CLASSES = {
    enemy: "float-dmg absolute text-balatro-red text-[1.6rem]",
    player: "float-dmg absolute text-balatro-red text-[1.6rem]",
    block: "float-dmg absolute text-balatro-purple text-[1.2rem]",
    buff: "float-dmg absolute text-balatro-gold text-[1.4rem]",
    heal: "float-dmg absolute text-balatro-green text-[1.6rem]",
    crit: "float-dmg crit absolute text-balatro-gold text-[2rem]", // boosted hits (see styles.css .float-dmg.crit)
  };

  const el = document.createElement("div");
  el.className =
    FLOAT_CLASSES[type] || `float-dmg absolute text-balatro-red text-[1.6rem]`;
  el.textContent = text;

  const l = parseFloat(left) || 30 + Math.random() * 40;
  const t = parseFloat(top) || 40 + Math.random() * 20;
  el.style.left = l + "%";
  el.style.top = t + "%";
  el.style.transform = "translateX(-50%)";

  container.appendChild(el);

  try {
    animate(
      el,
      { y: [0, -60], opacity: [1, 1, 0], scale: [0.6, 1.25, 1] },
      {
        duration: FLOAT_MS / 1000,
        easing: spring({ stiffness: 200, damping: 18 }),
      },
    );
  } catch (err) {}
  // The CSS floatUp animation (1.1s) does the visible floating; the timer only
  // guarantees removal even if Motion never resolves (see animateEnemyDamage).
  // No REDUCED_MOTION guard here on purpose: the damage number is informational
  // (not motion), and the global media rule already freezes its floatUp CSS.
  setTimeout(() => el.remove(), FLOAT_MS + 100);
}
