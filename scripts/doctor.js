#!/usr/bin/env node
/**
 * npm run doctor — one-shot diagnosis of a Synapse install.
 * Prints a checklist so problems are obvious without reading long logs.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { canBind, API_PORTS, WEB_PORTS } = require("./lib/ports");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

const venvPython = isWin
  ? path.join(backend, ".venv", "Scripts", "python.exe")
  : path.join(backend, ".venv", "bin", "python");

const lines = [];
let problems = 0;

function ok(label, detail = "") {
  lines.push(`  [OK]   ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label, hint) {
  problems += 1;
  lines.push(`  [FAIL] ${label}`);
  if (hint) lines.push(`         → ${hint}`);
}
function warn(label, hint) {
  lines.push(`  [WARN] ${label}`);
  if (hint) lines.push(`         → ${hint}`);
}

async function main() {
  console.log("\n=== Synapse DOCTOR ===");
  console.log("Root:", root);

  ok("Node.js", process.version);

  if (fs.existsSync(venvPython)) {
    const v = spawnSync(venvPython, ["--version"], { encoding: "utf8" });
    ok("backend/.venv", (v.stdout || v.stderr || "").trim());
  } else {
    bad("backend/.venv отсутствует", "npm run setup");
  }

  if (fs.existsSync(path.join(frontend, "node_modules"))) {
    ok("frontend/node_modules");
  } else {
    bad("frontend/node_modules отсутствует", "npm run setup");
  }

  if (fs.existsSync(path.join(backend, ".env"))) ok("backend/.env");
  else warn("backend/.env отсутствует", "будет создан автоматически при npm run dev");

  if (fs.existsSync(venvPython)) {
    const probe = path.join(os.tmpdir(), "synapse-doctor.py");
    fs.writeFileSync(
      probe,
      [
        "import importlib, json",
        "mods = ['fastapi','uvicorn','sqlalchemy','pydantic_settings','jose','bcrypt','g4f','pypdf','docx','dotenv']",
        "optional = ['faster_whisper']",
        "missing = []",
        "for m in mods:",
        "    try:",
        "        importlib.import_module(m)",
        "    except Exception as exc:",
        "        missing.append(m)",
        "out = {'missing': missing, 'optional_missing': []}",
        "for m in optional:",
        "    try:",
        "        importlib.import_module(m)",
        "    except Exception:",
        "        out['optional_missing'].append(m)",
        "try:",
        "    from app.main import app",
        "    out['app'] = app.title",
        "    from app.services import llm",
        "    out['ai'] = llm.status()",
        "except Exception as exc:",
        "    out['app_error'] = f'{type(exc).__name__}: {exc}'",
        "print('DOCTOR_JSON=' + json.dumps(out, ensure_ascii=False))",
      ].join("\n"),
      "utf8"
    );
    const r = spawnSync(venvPython, [probe], {
      cwd: backend,
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: backend },
    });
    fs.rmSync(probe, { force: true });

    const raw = `${r.stdout || ""}${r.stderr || ""}`;
    const match = raw.match(/DOCTOR_JSON=(.*)/);
    if (match) {
      let data = {};
      try {
        data = JSON.parse(match[1]);
      } catch (_) {}
      if ((data.missing || []).length) {
        bad(`Python-пакеты не установлены: ${data.missing.join(", ")}`, "npm run setup");
      } else {
        ok("Python-пакеты установлены");
      }
      if (data.app) ok("backend импортируется", data.app);
      else bad(`backend не импортируется: ${data.app_error || "unknown"}`, "npm run setup");

      const ai = data.ai || {};
      if (ai.custom_api_configured) {
        ok("Свой AI endpoint настроен", ai.custom_api_model || "");
      } else {
        ok("ИИ через бесплатные провайдеры", `${(ai.candidate_providers || []).length} кандидатов`);
      }

      const stt = ai.transcription || {};
      if (stt.local_whisper) {
        ok("Распознавание речи (локально)", `faster-whisper: ${stt.local_whisper_model}`);
      } else if (stt.api) {
        ok("Распознавание речи (через API)", stt.api_model || "");
      } else {
        warn(
          "Распознавание речи недоступно",
          "npm run setup переустановит faster-whisper (offline STT)"
        );
      }
      if ((data.optional_missing || []).includes("faster_whisper")) {
        warn("faster-whisper не установлен", "npm run setup");
      }
    } else {
      bad("Не удалось запустить проверку Python", raw.trim().split("\n").slice(-3).join(" | "));
    }
  }

  const freeApi = [];
  for (const p of API_PORTS) if (await canBind(p)) freeApi.push(p);
  if (freeApi.length) ok("Свободные порты для API", freeApi.join(", "));
  else bad("Все порты API заняты/заблокированы", "npm run stop, затем npm run dev");

  const freeWeb = [];
  for (const p of WEB_PORTS) if (await canBind(p)) freeWeb.push(p);
  if (freeWeb.length) ok("Свободные порты для сайта", freeWeb.join(", "));
  else bad("Все порты сайта заняты", "npm run stop");

  if (isWin && !(await canBind(8000))) {
    warn(
      "Порт 8000 недоступен (типично для Windows 11)",
      "это нормально: Synapse использует 8787"
    );
  }

  console.log("");
  console.log(lines.join("\n"));
  console.log("");
  if (problems) {
    console.log(`Найдено проблем: ${problems}. Запусти:  npm run setup`);
    process.exitCode = 1;
  } else {
    console.log("Всё готово. Запускай:  npm run dev");
  }
  console.log("");
}

main();
