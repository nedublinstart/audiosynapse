import path from "node:path";
import type { NextConfig } from "next";

// 8787 by default: on Windows 11 port 8000 is often blocked (WinError 10013).
const API_ORIGIN = process.env.API_PROXY_TARGET || "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  // Repo has a root package-lock.json too; pin the root to silence the warning.
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
