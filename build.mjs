// Usage: node /path/to/my-chizu/build.mjs /path/to/data-repo
// Full build: creates the deploy/ skeleton then populates it with data.
import { exec } from "child_process";
import { promisify } from "util";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const exec_promise = promisify(exec);

const engineDir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.argv[2]);

async function run(script) {
  const { stdout, stderr } = await exec_promise(
    `node "${script}" "${dataDir}"`
  );
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

await run(`${engineDir}/build-assets.mjs`);
await run(`${engineDir}/build-data.mjs`);
