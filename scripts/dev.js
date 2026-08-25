#!/usr/bin/env node
/**
 * npm run dev — start API + Next.js together (simple, like a normal app)
 *
 * Default API port is 8787 (not 8000): on Windows 11, port 8000 is often
 * blocked by Hyper-V / excluded port ranges → WinError 10013.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

const WEB_PORT = Number(process.env.SYNAPSE_WEB_PORT || 3000);
const API_PORT_PREFERRED = Number(process.env.SYNAPSE_API_PORT || 8787);
const API_PORT_FALLBACKS = [8787, 8765, 8899, 18080, 8000];

const venvPython = isWin
  ? path.join(backend, ".venv", "Scripts", "python.exe")
  : path.join(backend, ".venv", "bin", "python");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(venvPython)) {
  die("Backend venv missing. Run first:\n\n  npm run setup\n");
}
if (!fs.existsSync(path.join(frontend, "node_modules"))) {
  die("frontend/node_modules missing. Run first:\n\n  npm run setup\n");
}

if (!fs.existsSync(path.join(backend, ".env")) && fs.existsSync(path.join(backend, ".env.example"))) {
  fs.copyFileSync(path.join(backend, ".env.example"), path.join(backend, ".env"));
}
if (!fs.existsSync(path.join(frontend, ".env.local"))) {
  fs.writeFileSync(path.join(frontend, ".env.local"), "NEXT_PUBLIC_API_URL=\n", "utf8");
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function pickApiPort() {
  const candidates = [API_PORT_PREFERRED, ...API_PORT_FALLBACKS].filter(
    (p, i, arr) => Number.isFinite(p) && p > 0 && arr.indexOf(p) === i
  );
  for (const port of candidates) {
    if (await canBind(port)) return port;
  }
  die(
    "Не удалось занять ни один API-порт (8787/8765/8899/18080/8000).\n" +
      "Проверь: netsh interface ipv4 show excludedportrange protocol=tcp"
  );
}

const children = [];

function start(name, command, args, cwd, env = {}, useShell = false) {
  console.log(`[${name}] ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: useShell,
    windowsHide: false,
  });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited code=${code} signal=${signal || ""}`);
    shutdown(code || 0);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      if (isWin) {
        spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore", shell: true });
      } else {
        c.kill("SIGTERM");
      }
    } catch (_) {}
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

(async () => {
  const apiPort = await pickApiPort();
  const apiOrigin = `http://127.0.0.1:${apiPort}`;

  console.log("=== Synapse DEV ===");
  console.log(`API  ${apiOrigin}`);
  console.log(`WEB  http://127.0.0.1:${WEB_PORT}`);
  console.log("Stop: Ctrl+C\n");

  // Absolute python.exe must use shell:false (Windows quoting / DEP0190).
  start(
    "api",
    venvPython,
    ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", String(apiPort)],
    backend,
    { PYTHONPATH: backend },
    false
  );

  // npm.cmd on Windows needs shell:true to resolve via PATH.
  start(
    "web",
    isWin ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(WEB_PORT)],
    frontend,
    { API_PROXY_TARGET: apiOrigin },
    isWin
  );

  const ok = await waitHttp(`http://127.0.0.1:${WEB_PORT}/`);
  if (!ok) return;
  try {
    const open = (await import("open")).default;
    await open(`http://127.0.0.1:${WEB_PORT}`);
  } catch (_) {
    console.log(`Open manually: http://127.0.0.1:${WEB_PORT}`);
  }
})();

function waitHttp(url, tries = 90) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (n >= tries) resolve(false);
        else setTimeout(tick, 1000);
      });
    };
    tick();
  });
}
