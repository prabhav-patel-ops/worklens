import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const dir of ["server", "shared", "public", "scripts", "tests"]) {
  for (const file of await readdir(dir)) {
    if (!/\.(mjs|js)$/.test(file)) continue;
    const r = spawnSync(process.execPath, ["--check", `${dir}/${file}`], {
      stdio: "inherit",
    });
    if (r.status) process.exit(r.status);
  }
}
console.log("All JavaScript syntax checks passed.");
