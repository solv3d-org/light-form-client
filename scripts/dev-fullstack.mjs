import { spawn } from "node:child_process";

const commands = [
  ["web", ["run", "dev:web"]],
  ["backend", ["run", "dev:backend"]]
];

let stopping = false;
const children = commands.map(([name, args]) => {
  console.log(`[dev] starting ${name}: npm ${args.join(" ")}`);
  const child = spawn("npm", args, { stdio: "inherit", shell: false });
  child.on("error", (error) => {
    console.error(`[${name}] ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    console.log(`[dev] ${name} exited code=${code ?? ""} signal=${signal ?? ""}`);
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
  return child;
});

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  console.log(`[dev] stopping code=${code}`);
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
