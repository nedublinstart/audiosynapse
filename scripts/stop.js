#!/usr/bin/env node
/** Best-effort stop for all ports Synapse may use */
const { spawnSync } = require("child_process");
const { API_PORTS, WEB_PORTS } = require("./lib/ports");

const isWin = process.platform === "win32";
const PORTS = [...WEB_PORTS, ...API_PORTS];

function killPort(port) {
  if (isWin) {
    const out = spawnSync("netstat", ["-ano"], { encoding: "utf8", shell: true });
    const lines = (out.stdout || "").split(/\r?\n/);
    const pids = new Set();
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
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
