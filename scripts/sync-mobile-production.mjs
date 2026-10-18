import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "mobile:sync"], {
  env: {
    ...process.env,
    VITE_API_BASE_URL: "https://ruminate.simmonsweb.com",
    RUMINATE_MOBILE_DEV_HTTP: "false",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
