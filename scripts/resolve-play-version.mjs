import { appendFileSync } from "node:fs";

const tagged = process.env.GITHUB_REF_TYPE === "tag";
const name = tagged ? process.env.GITHUB_REF_NAME?.replace(/^v/, "") : process.env.INPUT_VERSION_NAME;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(name || "")) {
  throw new Error("Use a release tag vMAJOR.MINOR.PATCH or a manual version name MAJOR.MINOR.PATCH");
}
const [major, minor, patch] = name.split(".").map(Number);
if (tagged && (minor > 999 || patch > 999)) throw new Error("Tag minor and patch must be at most 999");
const code = tagged ? major * 1000000 + minor * 1000 + patch : Number(process.env.INPUT_VERSION_CODE);
if (!Number.isSafeInteger(code) || code < 1 || code > 2100000000) throw new Error("Invalid Android version code");
appendFileSync(process.env.GITHUB_OUTPUT, `name=${name}\ncode=${code}\n`);
console.log(`Play bundle version ${name}, code ${code}`);
