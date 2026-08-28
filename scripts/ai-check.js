#!/usr/bin/env node
/**
 * npm run ai-check — probe every AI engine from THIS machine/network and print
 * which ones actually answer. No server needed.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const isWin = process.platform === "win32";

const venvPython = isWin
  ? path.join(backend, ".venv", "Scripts", "python.exe")
  : path.join(backend, ".venv", "bin", "python");

if (!fs.existsSync(venvPython)) {
  console.error("\nСначала выполни:  npm run setup\n");
  process.exit(1);
}

const probe = path.join(os.tmpdir(), "synapse-ai-check.py");
fs.writeFileSync(
  probe,
  [
    "import json",
    "from app.services import llm",
    "print('AI_CHECK_JSON=' + json.dumps(llm.diagnose(), ensure_ascii=False))",
  ].join("\n"),
  "utf8"
);

console.log("\n=== Synapse AI CHECK ===");
console.log("Проверяю доступные ИИ-провайдеры (до ~40 секунд)...\n");

const r = spawnSync(venvPython, [probe], {
  cwd: backend,
  encoding: "utf8",
  env: { ...process.env, PYTHONPATH: backend },
});
fs.rmSync(probe, { force: true });

const raw = `${r.stdout || ""}${r.stderr || ""}`;
const match = raw.match(/AI_CHECK_JSON=(.*)/);
if (!match) {
  console.error("Не удалось выполнить проверку. Вывод:\n");
  console.error(raw.trim().split("\n").slice(-15).join("\n"));
  process.exit(1);
}

const data = JSON.parse(match[1]);

const api = data.custom_api || {};
if (api.configured) {
  const state = api.status === "ok" ? "[OK]  " : "[FAIL]";
  console.log(`${state} Свой API (${api.model})${api.status === "ok" ? "" : ` — ${api.status}`}`);
} else {
  console.log("[--]   Свой API не настроен (AI_BASE_URL / AI_API_KEY / AI_MODEL в backend/.env)");
}

console.log("");
for (const p of data.providers || []) {
  if (p.status === "ok") {
    console.log(`[OK]   ${p.provider} (${p.model})`);
  } else {
    console.log(`[FAIL] ${p.provider} — ${p.error || p.status}`);
  }
}

const working = data.working || [];
console.log("");
if (working.length || api.status === "ok") {
  console.log(`Рабочих провайдеров: ${working.length + (api.status === "ok" ? 1 : 0)}`);
  if (working.length) console.log(`Synapse будет использовать: ${working[0]}`);
  console.log("Можно запускать:  npm run dev");
} else {
  console.log("Ни один бесплатный провайдер не ответил (частая ситуация для некоторых регионов).");
  console.log("");
  console.log("Что делать — добавь бесплатный ключ OpenRouter в backend/.env:");
  console.log("  1. Зарегистрируйся на https://openrouter.ai и создай API key");
  console.log("  2. В backend/.env впиши:");
  console.log("       AI_BASE_URL=https://openrouter.ai/api/v1");
  console.log("       AI_API_KEY=sk-or-...");
  console.log("       AI_MODEL=deepseek/deepseek-chat-v3.1:free");
  console.log("  3. Повтори:  npm run ai-check");
  process.exitCode = 1;
}
console.log("");
