"use strict";

const { execSync } = require("child_process");
const path = require("path");

const DENY_PATTERNS = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\b(format|mkfs|diskpart)\b\s/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd[a-z]\b/i,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/i,
  /\|\s*(sh|bash)\b/i,
  /;\s*rm\s+-[rf]/i,
  /&&\s*rm\s+-[rf]/i,
  /\bsudo\b/i,
  /\bchown\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\bkill\s+-9\b/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bwget\b.*\|\s*(sh|bash)/i,
  /\bapt\s+(install|remove|purge)\b/i,
  /\byum\s+(install|remove)\b/i,
  /\bdocker\s+run\b/i,
  /\bgit\s+push\b/i,
  /\beval\b/i,
];

function guardCommand(command) {
  const lower = command.toLowerCase();
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(lower)) {
      return "Command blocked by safety guard (dangerous pattern detected)";
    }
  }
  return null;
}

const execTool = (workspace) => ({
  name: "exec",
  description:
    "Execute a shell command and return its output. Use with caution.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      working_dir: {
        type: "string",
        description: "Optional working directory for the command",
      },
    },
    required: ["command"],
  },
  async execute(args) {
    const command = args.command;
    if (!command) return { forLLM: "command is required", isError: true };

    const guardError = guardCommand(command);
    if (guardError) {
      return { forLLM: guardError, forUser: guardError, isError: true };
    }

    const cwd = args.working_dir
      ? path.resolve(args.working_dir)
      : path.resolve(workspace);

    try {
      const output = execSync(command, {
        cwd,
        timeout: 60000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const result = output || "(no output)";
      const truncated =
        result.length > 10000
          ? result.slice(0, 10000) +
            `\n... (truncated, ${result.length - 10000} more chars)`
          : result;

      return { forLLM: truncated, forUser: truncated, isError: false };
    } catch (err) {
      const output =
        (err.stdout || "") +
        (err.stderr ? "\nSTDERR:\n" + err.stderr : "") +
        `\nExit code: ${err.status}`;
      return { forLLM: output, forUser: output, isError: true };
    }
  },
});

module.exports = { execTool };
