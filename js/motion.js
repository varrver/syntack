/**
 * SYNTACK — Motion & Micro-interaction Controller
 * Uses Framer Motion / Motion Engine for spring physics, screen transitions, and card animations.
 */

import { animate, spring, stagger } from 'https://cdn.jsdelivr.net/npm/motion@10.18.0/+esm';

export function animateScreenTransition(fromEl, toEl) {
  if (!fromEl || !toEl) return;

  try {
    animate(
      fromEl,
      { opacity: [1, 0], scale: [1, 0.95] },
      { duration: 0.25 }
    ).then(() => {
      fromEl.classList.add('hidden');
      fromEl.classList.remove('flex');
      toEl.classList.remove('hidden');
      toEl.classList.add('flex');
      animate(
        toEl,
        { opacity: [0, 1], scale: [0.92, 1] },
        { duration: 0.35, easing: spring({ stiffness: 300, damping: 20 }) }
      );
    });
  } catch (err) {
    fromEl.classList.add('hidden');
    fromEl.classList.remove('flex');
    toEl.classList.remove('hidden');
    toEl.classList.add('flex');
  }
}

export function animateModalOpen(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('hidden');
  modalEl.classList.add('flex');

  const content = modalEl.querySelector('.modal-content');
  if (content) {
    try {
      animate(
        content,
        { opacity: [0, 1], scale: [0.85, 1], y: [30, 0] },
        { duration: 0.3, easing: spring({ stiffness: 350, damping: 22 }) }
      );
    } catch (e) {}
  }
}

export function animateModalClose(modalEl) {
  if (!modalEl) return;
  const content = modalEl.querySelector('.modal-content');
  if (content) {
    try {
      animate(
        content,
        { opacity: [1, 0], scale: [1, 0.9] },
        { duration: 0.2 }
      ).then(() => {
        modalEl.classList.add('hidden');
        modalEl.classList.remove('flex');
      });
    } catch (e) {
      modalEl.classList.add('hidden');
      modalEl.classList.remove('flex');
    }
  } else {
    modalEl.classList.add('hidden');
    modalEl.classList.remove('flex');
  }
}

export function animateHandStagger(container) {
  if (!container) return;
  const cards = container.querySelectorAll('.card');
  if (!cards || cards.length === 0) return;

  try {
    animate(
      cards,
      { y: [40, 0], opacity: [0, 1], scale: [0.85, 1] },
      { delay: stagger(0.06), duration: 0.35, easing: spring({ stiffness: 300, damping: 22 }) }
    );
  } catch (err) {
    cards.forEach((card) => {
      card.style.opacity = '1';
      card.style.transform = 'none';
    });
  }
}

export function animateCardPlay(cardEl, onComplete) {
  if (!cardEl) {
    if (onComplete) onComplete();
    return;
  }

  try {
    animate(
      cardEl,
      { y: [0, -40, 10], opacity: [1, 0.9, 0], scale: [1, 1.15, 0.8] },
      { duration: 0.35, easing: spring({ stiffness: 350, damping: 25 }) }
    ).then(() => {
      if (onComplete) onComplete();
    });
  } catch (err) {
    cardEl.classList.add('played');
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 350);
  }
}

export function animateInsufficientRam(cardEl) {
  if (!cardEl) return;
  try {
    animate(
      cardEl,
      { x: [0, -8, 8, -6, 6, 0] },
      { duration: 0.3, easing: spring({ stiffness: 400, damping: 15 }) }
    );
  } catch (err) {
    cardEl.classList.add('insufficient-ram');
    setTimeout(() => cardEl.classList.remove('insufficient-ram'), 400);
  }
}

export function animateEnemyDamage(enemyBoxEl) {
  if (!enemyBoxEl) return;
  try {
    animate(
      enemyBoxEl,
      { x: [0, -12, 12, -6, 6, 0], scale: [1, 1.04, 0.98, 1] },
      { duration: 0.35, easing: spring({ stiffness: 450, damping: 18 }) }
    );
  } catch (err) {
    enemyBoxEl.classList.add('attacking');
    setTimeout(() => enemyBoxEl.classList.remove('attacking'), 400);
  }
}

export function animateEnemyAttack(enemyBoxEl) {
  if (!enemyBoxEl) return;
  try {
    animate(
      enemyBoxEl,
      { y: [0, 15, -5, 0], scale: [1, 1.05, 1] },
      { duration: 0.4, easing: spring({ stiffness: 350, damping: 20 }) }
    );
  } catch (err) {
    enemyBoxEl.classList.add('attacking');
    setTimeout(() => enemyBoxEl.classList.remove('attacking'), 500);
  }
}

export function animateFloatDamage(text, type, left, top) {
  const container = document.getElementById("floatDmgContainer");
  if (!container) return;

  const FLOAT_CLASSES = {
    enemy: "float-dmg absolute text-b-red text-[1.6rem]",
    player: "float-dmg absolute text-b-red text-[1.6rem]",
    block: "float-dmg absolute text-b-purple text-[1.2rem]",
    buff: "float-dmg absolute text-b-gold text-[1.4rem]",
    heal: "float-dmg absolute text-b-green text-[1.6rem]",
  };

  const el = document.createElement("div");
  el.className = FLOAT_CLASSES[type] || `float-dmg absolute text-b-red text-[1.6rem]`;
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
      { duration: 1.1, easing: spring({ stiffness: 200, damping: 18 }) }
    ).then(() => el.remove());
  } catch (err) {
    setTimeout(() => el.remove(), 1200);
  }
}
