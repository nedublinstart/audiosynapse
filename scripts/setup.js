#!/usr/bin/env node
/**
 * Cross-platform Synapse setup: Python venv + pip + npm install.
 * Designed to survive common Windows quirks (missing pip, quoting, Cyrillic paths).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || root,
    // Absolute .exe paths must NOT use a shell on Windows — it breaks quoting.
    shell: opts.shell === true,
    env: { ...process.env, ...(opts.env || {}) },
    windowsHide: true,
  });
  if (r.error) throw new Error(`${cmd} not runnable: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(" ")}`);
}

function tryRun(cmd, args, opts = {}) {
  try {
    run(cmd, args, opts);
    return true;
  } catch (e) {
    console.warn(`(не критично) ${e.message}`);
    return false;
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
    const r = spawnSync(exe, [...baseArgs, "--version"], { encoding: "utf8", shell: isWin });
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    if ((r.status === 0 || out.includes("Python")) && out.includes("Python 3")) {
      return { exe, baseArgs };
    }
  }
  return null;
}

function hasPip(venvPython) {
  const r = spawnSync(venvPython, ["-m", "pip", "--version"], { encoding: "utf8" });
  return r.status === 0;
}

function ensurePip(venvPython) {
  if (hasPip(venvPython)) return true;

  console.log("\npip в venv отсутствует — восстанавливаю через ensurepip...");
  spawnSync(venvPython, ["-m", "ensurepip", "--upgrade"], { stdio: "inherit" });
  if (hasPip(venvPython)) return true;

  console.log("ensurepip не помог — скачиваю get-pip.py...");
  const target = path.join(os.tmpdir(), "synapse-get-pip.py");
  const dl = spawnSync(
    venvPython,
    [
      "-c",
      [
        "import urllib.request,sys",
        `urllib.request.urlretrieve('https://bootstrap.pypa.io/get-pip.py', r'${target}')`,
      ].join("; "),
    ],
    { stdio: "inherit" }
  );
  if (dl.status === 0 && fs.existsSync(target)) {
    spawnSync(venvPython, [target], { stdio: "inherit" });
  }
  return hasPip(venvPython);
}

function writeIfMissing(file, contents) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, contents, "utf8");
    console.log(`Created ${path.relative(root, file)}`);
  }
}

function main() {
  console.log("=== Synapse SETUP ===");
  console.log("Root:", root);
  console.log("Node:", process.version);

  const py = findPython();
  if (!py) {
    console.error(
      "\nPython 3 не найден.\n" +
        "Установи с https://www.python.org/downloads/ и включи галочку «Add python.exe to PATH»,\n" +
        "затем закрой это окно, открой новое и запусти npm run setup снова."
    );
    process.exit(1);
  }
  console.log("Python OK");

  const venvDir = path.join(backend, ".venv");
  const venvPython = isWin
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

  if (!fs.existsSync(venvPython)) {
    console.log("\nCreating backend/.venv ...");
    const created = tryRun(py.exe, [...py.baseArgs, "-m", "venv", venvDir], { shell: isWin });
    if (!created || !fs.existsSync(venvPython)) {
      // Some Python installs ship without ensurepip; build the venv and add pip after.
      console.log("Повторная попытка без pip (pip поставим отдельно)...");
      fs.rmSync(venvDir, { recursive: true, force: true });
      run(py.exe, [...py.baseArgs, "-m", "venv", "--without-pip", venvDir], { shell: isWin });
    }
  }
  if (!fs.existsSync(venvPython)) {
    throw new Error(
      `venv создан некорректно: нет ${venvPython}\n` +
        "Переустанови Python 3 с python.org (галочка «Add python.exe to PATH»)."
    );
  }

  if (!ensurePip(venvPython)) {
    throw new Error(
      "Не удалось поставить pip в backend/.venv.\n" +
        "Удали папку backend\\.venv и запусти npm run setup заново."
    );
  }

  tryRun(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(venvPython, ["-m", "pip", "install", "-r", path.join(backend, "requirements.txt")]);

  const envExample = path.join(backend, ".env.example");
  if (fs.existsSync(envExample)) {
    const envFile = path.join(backend, ".env");
    if (!fs.existsSync(envFile)) {
      fs.copyFileSync(envExample, envFile);
      console.log("Created backend/.env");
    }
  }
  writeIfMissing(path.join(frontend, ".env.local"), "NEXT_PUBLIC_API_URL=\n");

  console.log("\nInstalling frontend dependencies...");
  run(isWin ? "npm.cmd" : "npm", ["install"], { cwd: frontend, shell: isWin });

  console.log("\nInstalling root launcher dependencies...");
  run(isWin ? "npm.cmd" : "npm", ["install"], { cwd: root, shell: isWin });

  console.log("\nChecking backend import...");
  // Run a temp script file: avoids all -c quoting problems on Windows.
  const probe = path.join(os.tmpdir(), "synapse-import-check.py");
  fs.writeFileSync(probe, "from app.main import app\nprint('IMPORT OK:', app.title)\n", "utf8");
  const ok = tryRun(venvPython, [probe], { cwd: backend, env: { PYTHONPATH: backend } });
  fs.rmSync(probe, { force: true });

  console.log("\n=== SETUP DONE ===");
  if (!ok) {
    console.log("Проверка импорта не прошла, но зависимости установлены.");
    console.log("Запусти диагностику:  npm run doctor");
  }
  console.log("Now run:  npm run dev");
}

try {
  main();
} catch (e) {
  console.error("\nSETUP FAILED:", e.message || e);
  console.error("Диагностика:  npm run doctor");
  process.exit(1);
}
