#!/usr/bin/env node
/**
 * Cross-platform Synapse setup: Python venv + pip + frontend npm install
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  // Absolute .exe paths on Windows must NOT use shell:true — it breaks -c quoting.
  const useShell = opts.shell !== undefined ? opts.shell : false;
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || root,
    shell: useShell,
    env: { ...process.env, ...(opts.env || {}) },
    windowsHide: true,
  });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(" ")}`);
  }
}

function findPython() {
  const candidates = isWin
    ? [
        ["py", ["-3"]],
        ["python", []],
        ["python3", []],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];
  for (const [exe, baseArgs] of candidates) {
    const r = spawnSync(exe, [...baseArgs, "--version"], {
      encoding: "utf8",
      shell: isWin,
    });
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    if ((r.status === 0 || out.includes("Python")) && out.includes("Python 3")) {
      return { exe, baseArgs };
    }
  }
  return null;
}

function main() {
  console.log("=== Synapse SETUP ===");
  console.log("Root:", root);

  const py = findPython();
  if (!py) {
    console.error("Python 3 not found. Install from https://www.python.org/downloads/ (Add to PATH).");
    process.exit(1);
  }
  console.log("Python OK");

  const venvDir = path.join(backend, ".venv");
  const venvPython = isWin
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
  const venvPip = isWin
    ? path.join(venvDir, "Scripts", "pip.exe")
    : path.join(venvDir, "bin", "pip");

  if (!fs.existsSync(venvPython)) {
    console.log("Creating backend/.venv ...");
    run(py.exe, [...py.baseArgs, "-m", "venv", venvDir]);
  }

  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(venvPip, ["install", "-r", path.join(backend, "requirements.txt")]);

  const envFile = path.join(backend, ".env");
  const envExample = path.join(backend, ".env.example");
  if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    console.log("Created backend/.env");
  }

  const envLocal = path.join(frontend, ".env.local");
  if (!fs.existsSync(envLocal)) {
    fs.writeFileSync(envLocal, "NEXT_PUBLIC_API_URL=\n", "utf8");
    console.log("Created frontend/.env.local");
  }

  console.log("\nInstalling frontend dependencies...");
  run("npm", ["install"], { cwd: frontend });

  // Root helpers (concurrently, wait-on, open)
  console.log("\nInstalling root launcher dependencies...");
  run("npm", ["install"], { cwd: root });

  console.log("\nChecking backend import...");
  run(venvPython, ["-c", "from app.main import app; print('OK', app.title)"], {
    cwd: backend,
    env: { PYTHONPATH: backend },
  });

  console.log("\n=== SETUP DONE ===");
  console.log("Now run:  npm run dev");
}

try {
  main();
} catch (e) {
  console.error("\nSETUP FAILED:", e.message || e);
  process.exit(1);
}
