import { existsSync, readFileSync } from "node:fs";

// Minimal .env loader (no dependency). Real environment variables win over the file; empty values are ignored.
if (existsSync(".env"))
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    const v = m?.[2].replace(/^["']|["']$/g, "");
    if (m && !line.trim().startsWith("#") && v && process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
