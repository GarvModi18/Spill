import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDir = resolve(process.env.BACKUP_DIR ?? "./backups");
await mkdir(outputDir, { recursive: true });
const archive = resolve(outputDir, `spill-${stamp}.archive.gz`);
const child = spawn("mongodump", ["--uri", uri, "--archive", archive, "--gzip"], {
  stdio: "inherit",
  shell: false,
  windowsHide: true,
});

child.on("error", (error) => {
  console.error(`mongodump could not start: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (code === 0) console.log(`MongoDB backup written to ${archive}`);
  else process.exitCode = code ?? 1;
});
