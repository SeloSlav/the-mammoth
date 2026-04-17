import { execFileSync } from "node:child_process";

/**
 * Dev ergonomics helper:
 * Windows (especially) often leaves orphaned `vite` node processes around after crashes /
 * duplicate launches, which makes `npm run dev` fail with "Port 5173 is already in use".
 *
 * This script only kills listeners when the process command line matches ALL `--must-include`
 * substrings (case-insensitive). Intended to be invoked from package `dev` scripts.
 */

const args = process.argv.slice(2);

const mustInclude = [];
let port;

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--port") {
    port = Number(args[i + 1]);
    i += 1;
    continue;
  }
  if (a === "--must-include") {
    mustInclude.push(String(args[i + 1] ?? ""));
    i += 1;
    continue;
  }
}

if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error(
    "[free-local-dev-server-port] Usage: node scripts/free-local-dev-server-port.mjs --port 5173 --must-include substring ...",
  );
  process.exit(2);
}

if (mustInclude.length === 0) {
  console.error(
    "[free-local-dev-server-port] Refusing to run with zero --must-include guards (too dangerous).",
  );
  process.exit(2);
}

const normIncludes = mustInclude.map((s) => s.toLowerCase());

function ps(cmd, psArgs, opts = {}) {
  return execFileSync(cmd, psArgs, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

function winListeningPids(p) {
  const out = ps("netstat", ["-ano"]);
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    if (!line.includes(`:${p}`)) continue;
    const parts = line.trim().split(/\s+/);
    const maybePid = parts[parts.length - 1];
    const pid = Number(maybePid);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function winCommandLine(pid) {
  const psCmd =
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" ` +
    "| Select-Object -ExpandProperty CommandLine";
  return ps("powershell.exe", ["-NoProfile", "-Command", psCmd]).trim();
}

function nixListeningPids(p) {
  // Prefer lsof when present (macOS + many Linux dev machines).
  try {
    const out = ps("lsof", [
      "-n",
      "-P",
      `-iTCP:${p}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    const pids = out
      .split(/\r?\n/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(pids)];
  } catch {
    return [];
  }
}

function nixCommandLine(pid) {
  try {
    return ps("ps", ["-p", String(pid), "-o", "command="]).trim();
  } catch {
    return "";
  }
}

function matchesGuards(commandLine) {
  const hay = commandLine.toLowerCase();
  return normIncludes.every((needle) => hay.includes(needle));
}

function killTree(pid) {
  if (process.platform === "win32") {
    ps("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // If the process already exited, ignore.
  }
}

const pids =
  process.platform === "win32"
    ? winListeningPids(port)
    : nixListeningPids(port);

for (const pid of pids) {
  const cmdline =
    process.platform === "win32" ? winCommandLine(pid) : nixCommandLine(pid);
  if (!cmdline) continue;
  if (!matchesGuards(cmdline)) continue;

  console.warn(
    `[free-local-dev-server-port] Port ${port} is in use by a matching dev process (pid=${pid}); terminating so Vite can start.\n${cmdline}`,
  );
  killTree(pid);
}
