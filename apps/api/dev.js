const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const isWin = process.platform === "win32";
const venvPython = isWin
  ? path.join(__dirname, ".venv", "Scripts", "python.exe")
  : path.join(__dirname, ".venv", "bin", "python");

const pythonBin = fs.existsSync(venvPython) ? venvPython : "python";

console.log(`[API Dev] Using python executable: ${pythonBin}`);

const apiPort = process.env.API_PORT || "8000";

// We construct the command to run uvicorn backend.main:app
const args = [
  "-u",
  "-m",
  "uvicorn",
  "backend.main:app",
  "--reload",
  "--host",
  "0.0.0.0",
  "--port",
  apiPort,
];

const child = spawn(pythonBin, args, {
  shell: false,
});

// Explicitly relay stdout/stderr to prevent buffering/redirection loss in nested subprocesses
child.stdout.on("data", (data) => {
  process.stdout.write(data);
});

child.stderr.on("data", (data) => {
  process.stderr.write(data);
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

// Pass down termination signals
process.on("SIGINT", () => {
  if (child.pid) {
    if (isWin) {
      spawn("taskkill", ["/F", "/T", "/PID", child.pid]);
    } else {
      child.kill("SIGINT");
    }
  }
  process.exit();
});

process.on("SIGTERM", () => {
  if (child.pid) {
    if (isWin) {
      spawn("taskkill", ["/F", "/T", "/PID", child.pid]);
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exit();
});
