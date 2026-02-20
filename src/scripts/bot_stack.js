const { spawn, execSync } = require("node:child_process");
const path = require("node:path");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const rootDir = process.cwd();

function listProcesses() {
  try {
    return execSync("ps -axo pid=,ppid=,command=", { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        return {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          command: String(match[3] || "").trim(),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isBotProcess(command) {
  if (!command) return false;
  const checks = [
    /node(?:\s+--watch)?\s+.*src\/index\.js\b/i,
    /npm\s+run\s+(?:start|dev)\b/i,
    /node\s+.*src\/scripts\/bot_stack\.js\b/i,
  ];
  return checks.some((pattern) => pattern.test(command));
}

function stopExistingBotProcesses() {
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

  const targets = all.filter((proc) => {
    if (protectedPids.has(proc.pid)) return false;
    if (!isBotProcess(proc.command)) return false;

    // Keep scope to this repo when possible
    const inRepo = proc.command.includes(rootDir) || proc.command.includes(path.join(rootDir, "src", "index.js"));
    return inRepo || /node(?:\s+--watch)?\s+.*src\/index\.js\b/i.test(proc.command);
  });

  if (targets.length === 0) {
    console.log("[bot] no existing bot process found");
    return;
  }

  console.log(`[bot] found ${targets.length} bot process(es), stopping...`);
  for (const proc of targets) {
    try {
      process.kill(proc.pid, "SIGTERM");
      console.log(`[bot] stopped pid=${proc.pid} (${proc.command})`);
    } catch {}
  }
}

function run() {
  const child = spawn(npmCommand, ["run", "dev"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    console.error("[bot] failed to start:", err.message || err);
    process.exit(1);
  });

  const shutdown = () => {
    if (child.pid) {
      child.kill("SIGTERM");
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

stopExistingBotProcesses();
run();
