import { spawn } from "node:child_process";
import { prepareLocalDatabase } from "./local-db.mjs";

const cluster = await prepareLocalDatabase();
let child;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child?.kill();
  if (cluster) await cluster.stop();
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
async function run(file, args) {
  const code = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [file, ...args], { stdio: "inherit", env: process.env, windowsHide: true });
    child.on("error", reject); child.on("exit", resolve);
  });
  if (code !== 0) throw new Error(`${file} failed (${code})`);
}
try {
  await run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  await run("node_modules/tsx/dist/cli.mjs", ["prisma/seed.ts"]);
  if (process.argv.includes("--db-only")) {
    console.log("Local database ready. Ctrl+C to stop.");
    setInterval(() => {}, 60000);
  } else {
    await run("node_modules/next/dist/bin/next", ["dev", "--hostname", "127.0.0.1"]);
    await stop();
  }
} catch (error) { console.error(error); await stop(1); }
