// Minimal Chrome DevTools Protocol driver.
// Playwright can't be installed in this sandbox (npm policy 403s), so we drive
// the pre-installed Chromium over CDP with Node's global WebSocket instead.
import { spawn } from "node:child_process";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export async function launch({
  // Random port per run on purpose: a fixed one silently re-attaches to a
  // still-alive Chromium from a previous run, and you spend an hour debugging
  // "the app" when you're actually driving a stale browser.
  port = 9400 + Math.floor(Math.random() * 500),
  width = 1280,
  height = 900,
} = {}) {
  // A unique profile dir per launch, for the same reason as the random port:
  // sharing the default profile with a leftover instance deadlocks startup and
  // presents as launch() simply never returning.
  const profileDir = `/tmp/cdp-profile-${port}-${Date.now()}`;
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--no-sandbox",
    "--no-first-run",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--window-size=${width},${height}`,
    "about:blank",
  ], { stdio: "ignore", detached: false });

  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!target) throw new Error("Chromium did not expose a page target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("CDP WebSocket never opened")), 15000);
    ws.onopen = () => { clearTimeout(t); res(); };
    ws.onerror = (e) => { clearTimeout(t); rej(new Error("CDP WebSocket error")); };
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  const consoleErrors = [];
  const origOnMessage = ws.onmessage;
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
      consoleErrors.push(msg.params.entry.text);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params?.exceptionDetails?.text ?? "exception");
    }
    // Auto-accept beforeunload/alert dialogs. Without this, navigating away
    // from a form with unsaved changes (this app arms a beforeunload guard on
    // every dirty modal) blocks forever in headless Chrome and looks exactly
    // like a hung script.
    if (msg.method === "Page.javascriptDialogOpening") {
      ws.send(JSON.stringify({
        id: 100000 + Math.floor(Math.random() * 10000),
        method: "Page.handleJavaScriptDialog",
        params: { accept: true },
      }));
    }
    origOnMessage(m);
  };

  const api = {
    proc, send, consoleErrors, events,
    async goto(url) {
      await send("Page.navigate", { url });
      // Wait for the document to finish and React to hydrate.
      for (let i = 0; i < 120; i++) {
        const { result } = await send("Runtime.evaluate", {
          expression: "document.readyState === 'complete'", returnByValue: true,
        });
        if (result.value) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 800));
    },
    async eval(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression: `(() => { ${expression} })()`,
        returnByValue: true, awaitPromise: true,
      });
      if (exceptionDetails) throw new Error(exceptionDetails.text + " :: " + JSON.stringify(exceptionDetails.exception?.description ?? ""));
      return result.value;
    },
    /** A real dispatched mouse event — a plain DOM .click() reliably no-ops on
     *  first load in this sandbox (a trap earlier sessions hit and documented). */
    async clickSelector(sel, { nth = 0 } = {}) {
      const box = await api.eval(`
        const els = document.querySelectorAll(${JSON.stringify(sel)});
        const el = els[${nth}];
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      `);
      if (!box) throw new Error(`clickSelector: no element for ${sel}[${nth}]`);
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", {
          type, x: box.x, y: box.y, button: "left", clickCount: 1,
        });
      }
      await new Promise((r) => setTimeout(r, 350));
    },
    async clickText(sel, text) {
      const idx = await api.eval(`
        const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
        return els.findIndex(e => (e.textContent || '').includes(${JSON.stringify(text)}));
      `);
      if (idx < 0) throw new Error(`clickText: no ${sel} containing "${text}"`);
      await api.clickSelector(sel, { nth: idx });
    },
    /** Poll for an element, then set its value through React's own setter. */
    async setInput(sel, value, { timeoutMs = 5000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const ok = await api.eval(`
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return false;
          const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        `);
        if (ok) { await new Promise((r) => setTimeout(r, 250)); return; }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`setInput: element never appeared: ${sel}`);
    },
    async setViewport(width, height) {
      await send("Emulation.setDeviceMetricsOverride", {
        width, height, deviceScaleFactor: 1, mobile: width < 500,
      });
      await new Promise((r) => setTimeout(r, 400));
    },
    async overflows() {
      return api.eval(`return document.body.scrollWidth > document.documentElement.clientWidth;`);
    },
    async close() { try { ws.close(); } catch {} try { proc.kill("SIGKILL"); } catch {} },
  };
  return api;
}
