#!/usr/bin/env node
/**
 * npm run dev — start API + Next.js together.
 *
 * Ports are picked automatically: on Windows 8000 is often blocked
 * (WinError 10013) and 3000 is often already taken (EADDRINUSE).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const { pickPort, API_PORTS, WEB_PORTS } = require("./lib/ports");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

const venvPython = isWin
  ? path.join(backend, ".venv", "Scripts", "python.exe")
  : path.join(backend, ".venv", "bin", "python");

function die(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(venvPython)) {
  die("Backend venv missing. Run first:\n\n  npm run setup");
}
if (!fs.existsSync(path.join(frontend, "node_modules"))) {
  die("frontend/node_modules missing. Run first:\n\n  npm run setup");
}

if (!fs.existsSync(path.join(backend, ".env")) && fs.existsSync(path.join(backend, ".env.example"))) {
  fs.copyFileSync(path.join(backend, ".env.example"), path.join(backend, ".env"));
}
if (!fs.existsSync(path.join(frontend, ".env.local"))) {
  fs.writeFileSync(path.join(frontend, ".env.local"), "NEXT_PUBLIC_API_URL=\n", "utf8");
}

const children = [];
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

function start(name, command, args, cwd, env = {}, useShell = false) {
  console.log(`[${name}] ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: useShell,
  });
  child.on("error", (err) => {
    console.error(`[${name}] failed to start: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited code=${code} signal=${signal || ""}`);
    shutdown(code || 0);
  });
  children.push(child);
  return child;
}

function waitHttp(url, tries = 120) {
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

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

(async () => {
  const apiPort = await pickPort([process.env.SYNAPSE_API_PORT, ...API_PORTS].filter(Boolean));
  if (!apiPort) {
    die(
      "Свободный порт для API не найден (8787/8765/8899/18080/8000).\n" +
        "Закрой лишние процессы: npm run stop"
    );
  }
  const webPort = await pickPort([process.env.SYNAPSE_WEB_PORT, ...WEB_PORTS].filter(Boolean));
  if (!webPort) {
    die("Свободный порт для сайта не найден (3000/3001/3002/3010/4000).\nПопробуй: npm run stop");
  }

  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;

  console.log("=== Synapse DEV ===");
  console.log(`API  ${apiOrigin}`);
  console.log(`WEB  ${webOrigin}`);
  console.log("Stop: Ctrl+C\n");

  // Absolute python.exe must run with shell:false (Windows quoting).
  start(
    "api",
    venvPython,
    ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", String(apiPort)],
    backend,
    { PYTHONPATH: backend },
    false
  );

  // npm.cmd needs a shell on Windows to be resolved via PATH.
  start(
    "web",
    isWin ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(webPort)],
    frontend,
    { API_PROXY_TARGET: apiOrigin },
    isWin
  );

  const apiOk = await waitHttp(`${apiOrigin}/api/health`, 60);
  console.log(apiOk ? `[api] health OK ${apiOrigin}/api/health` : "[api] health не ответил — смотри лог выше");

  const webOk = await waitHttp(`${webOrigin}/`);
  if (!webOk) return;
  try {
    const open = (await import("open")).default;
    await open(webOrigin);
  } catch (_) {
    console.log(`Open manually: ${webOrigin}`);
  }
})();
