#!/usr/bin/env node
/**
 * SYNTACK QA — accessibility audit (spec §12).
 *
 * Injects axe-core (pinned to the latest 4.x from jsDelivr — network is a
 * prerequisite, same as the Tailwind/Motion CDNs) into each game screen and
 * runs a full audit: splash, home, arena, archive modal, rules modal, and both
 * end-overlay variants. Violations are grouped by screen and impact and written
 * to qa/reports/a11y.json.
 *
 * Exit codes: 0 = clean / only minor-moderate · 1 = critical or serious
 * violations found · 2 = error.
 *
 * Usage:
 *   node qa/a11y.mjs [--server http://localhost:8123] [--verbose]
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchChrome,
  CDP,
  pickPort,
  sleep,
  urlWith,
  killChrome,
} from "./lib/cdp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SERVER = "http://localhost:8123";
const OUT = join(ROOT, "qa", "reports");
mkdirSync(OUT, { recursive: true });

const AXE_SRC = "https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js";

/* The splash→home transition now animates (250ms fade-out, then a 350ms
   fade-in on the home screen). `home display === 'flex'` flips at the swap,
   while the fade-in is still running — axe must see fully-rendered colors,
   so wait until the incoming screen's opacity settles before auditing. */
const waitHomeSettled = (page) =>
  page.waitFor(
    `parseFloat(getComputedStyle(document.getElementById('home-screen')).opacity) > 0.99`,
    5000,
  );

const SCREENS = [
  {
    name: "splash",
    setup: (page) =>
      page.waitFor(`!!document.getElementById('btn-splash-start')`, 20000),
  },
  {
    name: "home",
    setup: async (page) => {
      await page.waitFor(
        `!!document.getElementById('btn-splash-start')`,
        20000,
      );
      await page.click("#btn-splash-start");
      await page.waitFor(
        `getComputedStyle(document.getElementById('home-screen')).display === 'flex'`,
        20000,
      );
      await waitHomeSettled(page);
    },
  },
  {
    name: "arena",
    setup: (page) =>
      page.waitFor(
        `getComputedStyle(document.getElementById('game-screen')).display === 'flex'`,
        20000,
      ),
  },
  {
    name: "archive-modal",
    setup: async (page) => {
      await page.waitFor(
        `!!document.getElementById('btn-splash-start')`,
        20000,
      );
      await page.click("#btn-splash-start");
      await page.waitFor(
        `getComputedStyle(document.getElementById('home-screen')).display === 'flex'`,
        20000,
      );
      await waitHomeSettled(page);
      await page.click("#btn-menu-archive");
      await page.waitFor(
        `getComputedStyle(document.getElementById('archive-modal')).display === 'flex'`,
        20000,
      );
    },
  },
  {
    name: "rules-modal",
    setup: async (page) => {
      await page.waitFor(
        `!!document.getElementById('btn-splash-start')`,
        20000,
      );
      await page.click("#btn-splash-start");
      await page.waitFor(
        `getComputedStyle(document.getElementById('home-screen')).display === 'flex'`,
        20000,
      );
      await waitHomeSettled(page);
      await page.click("#btn-menu-rules");
      await page.waitFor(
        `getComputedStyle(document.getElementById('rules-modal')).display === 'flex'`,
        20000,
      );
    },
  },
];

async function injectAxe(page) {
  await page.eval(
    `new Promise((res, rej) => {
       if (window.axe) return res(true);
       const s = document.createElement('script');
       s.src = ${JSON.stringify(AXE_SRC)};
       s.onload = () => res(true);
       s.onerror = () => rej(new Error('axe-core CDN load failed'));
       document.head.appendChild(s);
     })`,
    { awaitPromise: true },
  );
  await page.eval("window.axe && axe.setup && axe.setup()").catch(() => {});
}

async function runAxe(page) {
  await injectAxe(page);
  return page.eval(
    `axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => ({
       id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
       nodes: (v.nodes || []).map(n => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\\n')[0] })),
     })))`,
    { awaitPromise: true },
  );
}

/* Hook navigation guard — retries once against the transient cold-load flake
   (spec §11): a forced-state `?test=` navigation can fail once on a cold CDN
   load, leaving the target overlay unflexed and timing out the waitFor below
   (observed on the reward-overlay step). A fresh Page.navigate to the same URL
   forces a reload, which reliably clears the flake; only then do we give up.
   Worst-case cost of a retry ≈ 2 × (navigate settle + waitFor) — budgeted by
   the outer run timeout, so it can't hang the suite. */
async function navigateToHook(page, url, waitExpr, timeout = 20000) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.navigate(url);
      await page.waitFor(waitExpr, timeout);
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
      console.error(
        `[a11y] hook navigation failed on attempt ${attempt}; retrying once… ` +
          `(${url.split("?")[0]}: ${String(err.message).slice(0, 80)})`,
      );
      await sleep(500);
    }
  }
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const port = await pickPort();
  const userDataDir = mkdtempSync(join(tmpdir(), "syntack-a11y-"));
  let proc, page;
  const report = { server: SERVER, axe: AXE_SRC, screens: [] };
  const allCritical = [];
  try {
    const launched = await launchChrome({ userDataDir, port, verbose });
    proc = launched.proc;
    page = new CDP(launched.pageTarget.webSocketDebuggerUrl);
    await page.connect();
    await page.enableDomains();
    await page.setViewport(1280, 800);

    for (const screen of SCREENS) {
      const url =
        screen.name === "arena"
          ? urlWith(SERVER, { test: 1, screen: "arena", seed: 1 })
          : SERVER + "/index.html";
      await page.eval("localStorage.clear(); true").catch(() => {});
      await page.navigate(url);
      await screen.setup(page);
      const violations = await runAxe(page);
      report.screens.push({ name: screen.name, violations });
      if (verbose)
        console.error(
          `[a11y] ${screen.name}: ${violations.length} violation(s)`,
        );
    }

    // end-overlay variants via hook (each retried once against the §11 cold-load flake)
    for (const outcome of ["victory", "defeat"]) {
      await navigateToHook(
        page,
        urlWith(SERVER, { test: 1, screen: "arena", seed: 1, outcome }),
        `getComputedStyle(document.getElementById('end-overlay')).display === 'flex'`,
      );
      const violations = await runAxe(page);
      report.screens.push({ name: `end-overlay-${outcome}`, violations });
    }

    // reward overlay via hook (between node clears) — retried once: this is the
    // last hook navigation of the session and previously hit the §11 cold-CDN
    // flake, timing out on a cold Tailwind re-fetch after the earlier screens.
    await navigateToHook(
      page,
      urlWith(SERVER, { test: 1, screen: "arena", seed: 1, outcome: "reward" }),
      `getComputedStyle(document.getElementById('reward-overlay')).display === 'flex'`,
    );
    const violations = await runAxe(page);
    report.screens.push({ name: "reward-overlay", violations });

    const byImpact = (v) =>
      ({ critical: 0, serious: 0, moderate: 0, minor: 0 })[v] || 0;
    console.log("\n  SYNTACK accessibility audit (axe-core)");
    let grand = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const seen = new Set();
    for (const s of report.screens) {
      const c = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const v of s.violations) {
        const k = v.impact || "minor";
        c[k] = (c[k] || 0) + 1;
        grand[k] = (grand[k] || 0) + 1;
        seen.add(v.id);
        if (
          (k === "critical" || k === "serious") &&
          !allCritical.find((x) => x.id === v.id)
        ) {
          allCritical.push({
            screen: s.name,
            id: v.id,
            impact: k,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.slice(0, 3),
          });
        }
      }
      const total = s.violations.length;
      console.log(
        `  ${total ? "⚠" : "✔"} ${s.name.padEnd(18)} ${total} violation(s)  [crit ${c.critical} · ser ${c.serious} · mod ${c.moderate} · min ${c.minor}]`,
      );
    }
    console.log(
      `  totals: critical ${grand.critical} · serious ${grand.serious} · moderate ${grand.moderate} · minor ${grand.minor} (${seen.size} unique rule ids)`,
    );
    if (allCritical.length) {
      console.log("\n  critical/serious findings:");
      for (const f of allCritical) {
        console.log(`   [${f.impact.toUpperCase()}] ${f.id} — ${f.help}`);
        f.nodes.forEach((n) => console.log(`        at ${n.target}`));
      }
    } else {
      console.log("\n  no critical or serious violations ✓");
    }
    writeFileSync(join(OUT, "a11y.json"), JSON.stringify(report, null, 2));
    console.log("  wrote qa/reports/a11y.json");
    if (grand.critical + grand.serious > 0) process.exitCode = 1;
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
  console.error("FATAL:", e.message);
  process.exit(2);
});
