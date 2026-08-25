#!/usr/bin/env node
/** Best-effort stop for Synapse ports on Windows/macOS/Linux */
const { spawnSync } = require("child_process");
const isWin = process.platform === "win32";

const PORTS = [3000, 8787, 8765, 8899, 18080, 8000];

function killPort(port) {
  if (isWin) {
    const out = spawnSync("netstat", ["-ano"], { encoding: "utf8", shell: true });
    const lines = (out.stdout || "").split(/\r?\n/);
    const pids = new Set();
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid)) pids.add(pid);
      }
    }
    for (const pid of pids) {
      console.log(`Killing PID ${pid} (port ${port})`);
      spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { shell: true, stdio: "inherit" });
    }
  } else {
    const out = spawnSync("lsof", [`-ti:${port}`], { encoding: "utf8" });
    const pids = (out.stdout || "").trim().split(/\n/).filter(Boolean);
    for (const pid of pids) {
      console.log(`Killing PID ${pid} (port ${port})`);
      spawnSync("kill", ["-9", pid], { stdio: "inherit" });
    }
  }
}

console.log("Stopping Synapse ports:", PORTS.join(", "));
for (const port of PORTS) killPort(port);
console.log("Done.");
