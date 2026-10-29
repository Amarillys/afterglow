// Minimal CDP driver for headless Edge. Used by smoke.mjs / hours.mjs.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ROOT = resolve(import.meta.dirname, "..");
export const SHOTS = resolve(ROOT, "test-screenshots", readFileSync(resolve(ROOT, "VERSION"), "utf8").trim());
export const pageUrl = (q = "") => pathToFileURL(resolve(ROOT, "index.html")).href + q;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1280, height = 800, port = 9333 } = {}) {
  mkdirSync(SHOTS, { recursive: true });
  const proc = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${port}`, `--window-size=${width},${height}`,
    `--user-data-dir=${resolve(ROOT, "test-scripts/.profile")}`, "--no-first-run",
    "--autoplay-policy=no-user-gesture-required", "about:blank",
  ], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 50; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch (e) {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  const listeners = {};
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push("EXCEPTION: " + (d.exception?.description || d.text) + " @" + d.url + ":" + d.lineNumber);
    } else if (listeners[msg.method]) {
      listeners[msg.method].forEach((fn) => fn(msg.params));
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      pending.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  // headless windows report no focus; tests run as a focused tab unless they say otherwise
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });

  const api = {
    logs, send, pid: proc.pid,
    on(method, fn) {
      (listeners[method] ||= []).push(fn);
    },
    async go(url) {
      await send("Page.navigate", { url });
      await sleep(1200);
    },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) return "EVAL ERROR: " + r.result.exceptionDetails.exception?.description;
      return r.result?.result?.value;
    },
    async shot(name) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(resolve(SHOTS, name + ".png"), Buffer.from(r.result.data, "base64"));
    },
    async mouse(type, x, y, buttons = 0) {
      await send("Input.dispatchMouseEvent", {
        type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount: 1,
      });
    },
    async click(x, y) {
      await api.mouse("mousePressed", x, y, 1);
      await api.mouse("mouseReleased", x, y, 0);
    },
    async drag(pts, stepMs = 16) {
      await api.mouse("mousePressed", pts[0][0], pts[0][1], 1);
      for (const [x, y] of pts.slice(1)) {
        await api.mouse("mouseMoved", x, y, 1);
        await sleep(stepMs);
      }
      const [x, y] = pts[pts.length - 1];
      await api.mouse("mouseReleased", x, y, 0);
    },
    async key(code, key) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", code, key, text: key.length === 1 ? key : undefined });
      await send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
    },
    async upload(selector, file) {
      const doc = await send("DOM.getDocument", {});
      const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector });
      await send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [resolve(ROOT, file)] });
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
  return api;
}
