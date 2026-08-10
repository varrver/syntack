/**
 * SYNTACK QA — minimal Chrome DevTools Protocol client (zero dependencies).
 *
 * Uses Node's built-in global `WebSocket` (Node >= 22) and the `http` module,
 * so there is nothing to install. Provides everything the harness needs:
 * launching headless Chrome, JSON-RPC over WebSocket, DOM evaluation,
 * trusted-ish clicks, keyboard events, screenshots, and emulation.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal JSON GET (used to discover the DevTools endpoint). */
function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** Ask the OS for a free TCP port for Chrome's remote debugging. */
export function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Kill the Chrome process tree. The browser binary is often reached through a
 * wrapper/launcher (e.g. /usr/bin/brave-origin) that spawns the real browser
 * as its own child, so killing only `proc` would orphan the browser. Because
 * launchChrome spawns detached, the whole tree shares the child's process
 * group; SIGKILL the group (-pid), falling back to a plain kill if the group
 * no longer exists (e.g. the process already exited).
 */
export function killChrome(proc) {
  if (!proc || !proc.pid) return;
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch (err) {
    // ESRCH = the group is already gone (normal on double-cleanup) — silent.
    // Anything else means the kill failed, so say so instead of orphaning
    // silently (e.g. EPERM); the plain-kill fallback still gets a chance.
    if (err.code !== 'ESRCH') {
      console.error(`[qa] killChrome: group kill failed (pid ${proc.pid}): ${err.message}`);
    }
    try {
      proc.kill('SIGKILL');
    } catch (err2) {
      if (err2.code !== 'ESRCH') {
        console.error(`[qa] killChrome: process kill failed (pid ${proc.pid}): ${err2.message}`);
      }
    }
  }
}

/**
 * Launch headless Chrome with remote debugging enabled and wait until the
 * DevTools endpoint answers. Returns { proc, pageTarget, browserWs }.
 */
export async function launchChrome({ userDataDir, port, verbose = false }) {
  const bin = process.env.CHROME_BIN || 'google-chrome';
  const args = [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  // detached: the child becomes the leader of its own process group, so
  // killChrome() can SIGKILL the whole tree — Chrome binaries are frequently
  // wrapper/launcher processes whose real browser is a child process. Note:
  // the browser no longer shares the terminal's process group, so Ctrl+C only
  // reaches node — the SIGINT/SIGTERM/exit handlers (registerCleanup) are the
  // sole cleanup line, and a hard kill -9 of the harness can orphan the
  // browser (same as before, but worth knowing).
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d;
    if (stderr.length > 20000) stderr = stderr.slice(-20000);
  });
  // Detach the child (and its stderr pipe) from the event loop. Without this,
  // Chrome/Brave helper processes inherit the stderr pipe write-end and can
  // outlive the SIGKILLed browser, so the harness finishes its work but Node
  // never exits (the pipe read handle never EOFs). unref() only changes the
  // natural-exit wait — callers still kill the process explicitly in cleanup,
  // and the error-tail capture above keeps working.
  proc.unref();
  proc.stderr.unref();

  const deadline = Date.now() + 15000;
  let version = null;
  while (Date.now() < deadline) {
    try {
      version = await getJson(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      await sleep(150);
    }
  }

  if (!version) {
    killChrome(proc);
    throw new Error(
      `Chrome did not open a debugging port within 15s.\n` +
        `Binary: ${bin}\nstderr tail:\n${stderr.slice(-1200)}`
    );
  }

  // Find the initial page target.
  let pageTarget = null;
  for (let i = 0; i < 30; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      pageTarget = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pageTarget) break;
    } catch {}
    await sleep(150);
  }
  if (!pageTarget) {
    killChrome(proc);
    throw new Error('Chrome started but no page target was exposed.');
  }

  if (verbose) console.error(`[chrome] launched pid=${proc.pid} port=${port}`);
  return { proc, pageTarget, browserWs: version.webSocketDebuggerUrl };
}

/** Minimal CDP JSON-RPC session bound to a single target. */
export class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`WebSocket error connecting to ${this.wsUrl}`));
    });

    this.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        const hs = this.handlers.get(msg.method);
        if (hs) for (const h of hs) h(msg.params);
      }
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate an expression in the page; returns the serialized value. */
  async eval(expression, { awaitPromise = false } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception || {};
      throw new Error(`eval threw: ${d.description || r.exceptionDetails.text}`);
    }
    return r.result && 'value' in r.result ? r.result.value : undefined;
  }

  /** Navigate and wait for the document to finish loading + settle. */
  async navigate(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor(`document.readyState === 'complete'`, 15000).catch(() => {});
    await sleep(350); // let post-load JS (CDNs, init) settle
  }

  /** Poll an expression until truthy; throws on timeout. */
  async waitFor(expression, timeout = 15000, interval = 150) {
    const deadline = Date.now() + timeout;
    for (;;) {
      try {
        if (await this.eval(expression)) return true;
      } catch {
        /* expression may throw while the page is mid-transition */
      }
      if (Date.now() > deadline) {
        throw new Error(`waitFor timeout (${timeout}ms): ${expression}`);
      }
      await sleep(interval);
    }
  }

  /**
   * DOM click. Focuses the element first (like a real user would) so that
   * `document.activeElement` reflects the clicked control — the game relies
   * on this to capture focus for modal focus-restore — then fires el.click().
   */
  async click(selector) {
    const ok = await this.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.click(); return true; })()`
    );
    if (!ok) throw new Error(`click: selector not found — ${selector}`);
  }

  /** Dispatch a raw key press (keyDown + keyUp). */
  async key(key, code, vk) {
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await this.send('Input.dispatchKeyEvent', { ...base, type: 'keyDown' });
    await this.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  }

  /** Capture a full-page PNG screenshot of the current viewport. */
  async screenshot(filePath) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(filePath, Buffer.from(r.data, 'base64'));
  }

  /** Override the viewport size (CSS pixels, scale 1, desktop-style UA). */
  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  /** Emulate prefers-reduced-motion: 'reduce' | 'no-preference'. */
  async setReducedMotion(value) {
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    });
  }

  async enableDomains() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
  }

  async close() {
    try {
      this.ws && this.ws.close();
    } catch {}
  }
}

/** Convenience: build a URL with query params from a base URL. */
export const urlWith = (base, params) => {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
};
