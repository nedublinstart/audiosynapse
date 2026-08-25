"use strict";
const net = require("net");

function canBind(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function pickPort(candidates) {
  const seen = [];
  for (const port of candidates) {
    const p = Number(port);
    if (!Number.isFinite(p) || p <= 0 || seen.includes(p)) continue;
    seen.push(p);
    if (await canBind(p)) return p;
  }
  return null;
}

// 8000 is often inside a Windows excluded port range (WinError 10013), so it is last.
const API_PORTS = [8787, 8765, 8899, 18080, 8000];
const WEB_PORTS = [3000, 3001, 3002, 3010, 4000];

module.exports = { canBind, pickPort, API_PORTS, WEB_PORTS };
