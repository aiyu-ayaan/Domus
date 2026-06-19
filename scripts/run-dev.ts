import { execSync, spawn } from "child_process";
import readline from "readline";

const port = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

if (!port || !command) {
  console.error("Usage: bun run scripts/run-dev.ts <port> <command> [args...]");
  process.exit(1);
}

// Hook up readline to handle Ctrl+C signal on Windows terminals
if (process.platform === "win32") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on("SIGINT", () => {
    process.emit("SIGINT");
  });
}

// 1. Kill any existing process on the port
try {
  if (process.platform === "win32") {
    const stdout = execSync(`netstat -ano`).toString();
    const lines = stdout.split("\n");
    const pids = new Set<string>();

    // Look for lines that contain the port, e.g. ":3000 " or "[::]:3000"
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        const localAddr = parts[1];
        // The last part is the PID
        const pid = parts[parts.length - 1];

        if (
          localAddr &&
          (localAddr.endsWith(`:${port}`) || localAddr.includes(`:${port}`)) &&
          pid &&
          pid !== "0"
        ) {
          // Verify pid is numeric
          if (/^\d+$/.test(pid)) {
            pids.add(pid);
          }
        }
      }
    }

    for (const pid of pids) {
      console.log(
        `[Dev Runner] Port ${port} is in use by PID ${pid}. Terminating process...`,
      );
      try {
        execSync(`taskkill /F /PID ${pid}`);
      } catch (e) {
        // ignore errors if process already exited
      }
    }
  } else {
    // Linux/macOS
    try {
      execSync(`lsof -t -i:${port} | xargs kill -9`);
      console.log(`[Dev Runner] Cleaned up port ${port}.`);
    } catch (e) {
      // ignore if lsof fails or returns empty
    }
  }
} catch (err) {
  // Ignore error if port checks fail
}

// 2. Spawn the new process
console.log(`[Dev Runner] Starting process: ${command} ${args.join(" ")}`);
const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
});

let isCleaningUp = false;
const cleanup = () => {
  if (isCleaningUp) return;
  isCleaningUp = true;

  if (child.pid) {
    console.log(
      `[Dev Runner] Terminating process tree for PID ${child.pid}...`,
    );
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /F /T /PID ${child.pid}`);
      } catch (e) {}
    } else {
      try {
        child.kill("SIGKILL");
      } catch (e) {}
    }
  }
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);
