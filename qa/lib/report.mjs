/**
 * SYNTACK QA — report writers (zero dependencies).
 *
 * Produces: a live terminal summary table, `report.json` (machine-readable),
 * and `report.md` (human-readable with screenshot links).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SEV_ICON = { PASS: '✔', FAIL: '✘', SKIP: '–', WARN: '!', INFO: '·', ENV: '≈', IGNORE: '·' };

function checkSeverity(c) {
  if (c.skipped) return 'SKIP';
  return c.pass ? 'PASS' : 'FAIL';
}

function scenarioRow(sc) {
  const sevs = sc.checks.map(checkSeverity);
  const failed = sevs.filter((s) => s === 'FAIL').length;
  const skipped = sevs.filter((s) => s === 'SKIP').length;
  const status = sc.error ? 'ERROR' : failed > 0 ? 'FAIL' : skipped === sevs.length ? 'SKIP' : 'PASS';
  return {
    ...sc,
    status,
    failed,
    skipped,
    consoleFails: (sc.console || []).filter((e) => e.severity === 'FAIL').length,
    consoleWarns: (sc.console || []).filter((e) => e.severity === 'WARN').length,
  };
}

export function buildReport({ meta, scenarios }) {
  const rows = scenarios.map(scenarioRow);
  const summary = {
    scenarios: rows.length,
    passed: rows.filter((r) => r.status === 'PASS').length,
    failed: rows.filter((r) => r.status === 'FAIL').length,
    errored: rows.filter((r) => r.status === 'ERROR').length,
    skipped: rows.filter((r) => r.status === 'SKIP').length,
    checksPassed: rows.reduce((n, r) => n + r.checks.filter((c) => !c.skipped && c.pass).length, 0),
    checksFailed: rows.reduce((n, r) => n + r.checks.filter((c) => !c.skipped && !c.pass).length, 0),
    checksSkipped: rows.reduce((n, r) => n + r.checks.filter((c) => c.skipped).length, 0),
    consoleFailures: rows.reduce((n, r) => n + r.consoleFails, 0),
    consoleWarnings: rows.reduce((n, r) => n + r.consoleWarns, 0),
  };
  return { meta, scenarios: rows, summary };
}

export function terminalSummary(report, { verbose = false } = {}) {
  const lines = [];
  lines.push('');
  lines.push('  SYNTACK visual check');
  lines.push('  ' + '─'.repeat(64));
  let prev = null;
  for (const sc of report.scenarios) {
    if (sc.viewport !== prev) {
      lines.push(`  ${sc.viewport.toUpperCase()}  ${sc.viewportWidth}×${sc.viewportHeight}`);
      prev = sc.viewport;
    }
    const sev = sc.status === 'PASS' ? '✔' : sc.status === 'SKIP' ? '–' : sc.status === 'ERROR' ? '✘' : '✘';
    lines.push(
      `    ${sev} ${sc.name.padEnd(16)} seed=${String(sc.seed).padEnd(5)} ` +
        `checks ${sc.checks.filter((c) => !c.skipped).length}/${sc.checks.length}` +
        (sc.failed ? `  FAILED(${sc.failed})` : '') +
        (sc.skipped ? `  skipped(${sc.skipped})` : '') +
        (sc.consoleFails ? `  console-FAIL(${sc.consoleFails})` : '') +
        (sc.consoleWarns ? `  warn(${sc.consoleWarns})` : '')
    );
    if (sc.error) lines.push(`      error: ${sc.error}`);
    if (verbose) {
      for (const c of sc.checks) {
        if (!c.pass && !c.skipped) lines.push(`        ${SEV_ICON[checkSeverity(c)]} ${c.name} — ${c.detail}`);
      }
      for (const e of sc.console || []) {
        if (e.severity === 'FAIL' || e.severity === 'WARN') lines.push(`        ${SEV_ICON[e.severity]} console: ${e.message}`);
      }
    }
  }
  const s = report.summary;
  lines.push('  ' + '─'.repeat(64));
  lines.push(
    `  scenarios: ${s.scenarios}   passed ${s.passed}  failed ${s.failed}  errored ${s.errored}  skipped ${s.skipped}`
  );
  lines.push(
    `  checks: ${s.checksPassed} passed, ${s.checksFailed} failed, ${s.checksSkipped} skipped` +
      `   console: ${s.consoleFailures} FAIL, ${s.consoleWarnings} WARN`
  );
  lines.push(`  finished in ${report.meta.elapsedMs} ms`);
  lines.push('');
  return lines.join('\n');
}

export function writeJson(report, outDir) {
  const path = join(outDir, 'report.json');
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

function mdTable(rows) {
  const w = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const head = `| Check | Result | Detail |`;
  const sep = `|-------|--------|--------|`;
  const body = rows
    .map((c) => `| ${w(c.name)} | ${c.skipped ? 'SKIP' : c.pass ? '**PASS**' : '**FAIL**'} | ${w(c.detail)} |`)
    .join('\n');
  return `${head}\n${sep}\n${body}`;
}

export function writeMarkdown(report, outDir) {
  const md = [];
  const s = report.summary;
  md.push(`# SYNTACK — Visual Check Report`);
  md.push('');
  md.push(`- **Date:** ${report.meta.date}`);
  md.push(`- **Server:** ${report.meta.server}`);
  md.push(`- **Chrome:** ${report.meta.chrome}`);
  md.push(`- **Node:** ${report.meta.node}`);
  md.push(`- **Elapsed:** ${report.meta.elapsedMs} ms`);
  md.push(`- **Test hook available (Phase 2):** ${report.meta.hookAvailable ? 'yes' : 'no'}`);
  md.push('');
  md.push(`## Summary`);
  md.push('');
  md.push(
    `| Scenarios | Passed | Failed | Errored | Skipped | Checks ✔ | Checks ✘ | Console FAIL | Console WARN |`
  );
  md.push(
    `|---|---|---|---|---|---|---|---|---|`
  );
  md.push(
    `| ${s.scenarios} | ${s.passed} | ${s.failed} | ${s.errored} | ${s.skipped} | ${s.checksPassed} | ${s.checksFailed} | ${s.consoleFailures} | ${s.consoleWarnings} |`
  );
  md.push('');

  for (const sc of report.scenarios) {
    md.push(`## ${sc.name} — ${sc.viewport} (seed ${sc.seed})`);
    md.push('');
    md.push(`**Status:** ${sc.status === 'PASS' ? '✅ PASS' : sc.status === 'SKIP' ? '⏭️ SKIP' : '❌ ' + sc.status}`);
    if (sc.error) md.push(`\n**Run error:** \`${sc.error}\`\n`);
    md.push('');
    md.push(mdTable(sc.checks));
    md.push('');
    if (sc.screenshots && sc.screenshots.length) {
      md.push(`**Screenshots:**`);
      md.push('');
      for (const shot of sc.screenshots) {
        md.push(`![${shot}](${shot})`);
      }
      md.push('');
    }
    const consoleEvents = (sc.console || []).filter((e) => e.severity !== 'IGNORE');
    if (consoleEvents.length) {
      md.push(`**Console / network events:**`);
      md.push('');
      for (const e of consoleEvents) {
        md.push(`- \`${e.severity}\` — ${e.message}`);
      }
      md.push('');
    }
  }
  md.push('---');
  md.push(`_Generated by \`node qa/run.mjs\` — screenshots in \`qa/screenshots/\`, JSON in \`qa/reports/report.json\`._`);

  const path = join(outDir, 'report.md');
  writeFileSync(path, md.join('\n'));
  return path;
}
