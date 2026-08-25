#!/usr/bin/env node
/**
 * npm run dev — start API + Next.js together (simple, like a normal app)
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

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

const children = [];

function start(name, command, args, cwd, env = {}) {
  console.log(`[${name}] ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: isWin,
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

console.log("=== Synapse DEV ===");
console.log("API  http://127.0.0.1:8000");
console.log("WEB  http://127.0.0.1:3000");
console.log("Stop: Ctrl+C\n");

start(
  "api",
  venvPython,
  ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
  backend,
  { PYTHONPATH: backend }
);

start(
  "web",
  isWin ? "npm.cmd" : "npm",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"],
  frontend
);

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

(async () => {
  const ok = await waitHttp("http://127.0.0.1:3000/");
  if (!ok) return;
  try {
    const open = (await import("open")).default;
    await open("http://127.0.0.1:3000");
  } catch (_) {
    console.log("Open manually: http://127.0.0.1:3000");
  }
})();
