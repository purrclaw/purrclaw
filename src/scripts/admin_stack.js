const { spawn } = require("node:child_process");
const { execSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const adminPort = String(process.env.ADMIN_PORT || "3010");
const backendEnv = {
  ...process.env,
  ADMIN_PORT: adminPort,
};
const frontendEnv = {
  ...process.env,
  VITE_API_URL: process.env.VITE_API_URL || `http://localhost:${adminPort}/api`,
};

let shuttingDown = false;
const children = [];

function listProcesses() {
  try {
    return execSync("ps -axo pid=,ppid=,command=", { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        const pid = Number(match[1]);
        const ppid = Number(match[2]);
        const command = String(match[3] || "").trim();
        if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !command) return null;
        return { pid, ppid, command };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isAdminProcess(command) {
  if (!command) return false;
  const checks = [
    /node(?:\s+--watch)?\s+.*src\/admin\/index\.js\b/i,
    /node\s+.*src\/scripts\/admin_stack\.js\b/i,
    /npm\s+run\s+admin(?::[a-z:-]+)?\b/i,
    /admin\/frontend.*\bbun\s+run\s+dev\b/i,
    /\bcd\s+admin\/frontend\b.*\bbun\s+run\s+dev\b/i,
    /\bvite\b.*\badmin\/frontend\b/i,
  ];
  return checks.some((pattern) => pattern.test(command));
}

function stopExistingAdminProcesses() {
  const all = listProcesses();
  const byPid = new Map(all.map((proc) => [proc.pid, proc]));
  const protectedPids = new Set();
  let cursor = process.pid;
  while (Number.isInteger(cursor) && cursor > 1 && !protectedPids.has(cursor)) {
    protectedPids.add(cursor);
    const proc = byPid.get(cursor);
    if (!proc) break;
    cursor = proc.ppid;
  }

  const targets = all.filter(
    (proc) =>
      !protectedPids.has(proc.pid) &&
      isAdminProcess(proc.command),
  );

  if (targets.length === 0) {
    return;
  }

  console.log(`[admin] found ${targets.length} running admin process(es), stopping...`);
  for (const proc of targets) {
    try {
      process.kill(proc.pid, "SIGTERM");
      console.log(`[admin] stopped pid=${proc.pid} (${proc.command})`);
    } catch {}
  }
}

function run(name, command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const proc of children) {
      if (proc.pid && proc.pid !== child.pid) {
        proc.kill("SIGTERM");
      }
    }
    if (signal) {
      console.error(`[admin] ${name} exited by signal ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.error(`[admin] failed to start ${name}:`, err.message || err);
    for (const proc of children) {
      if (proc.pid && proc.pid !== child.pid) {
        proc.kill("SIGTERM");
      }
    }
    process.exit(1);
  });

  children.push(child);
}

stopExistingAdminProcesses();
run("backend", npmCommand, ["run", "admin:backend:dev"], backendEnv);
run("frontend", npmCommand, ["run", "admin:dev"], frontendEnv);

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (child.pid) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(0), 200);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
