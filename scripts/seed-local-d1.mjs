import { spawnSync } from "node:child_process";

// shell: true lets plain "npx" resolve on Windows, macOS and Linux alike.
const result = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/seed.sql", "--config", "wrangler.jsonc"],
  { cwd: process.cwd(), stdio: "inherit", shell: true },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
