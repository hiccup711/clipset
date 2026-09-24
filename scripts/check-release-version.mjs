import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargo = read("src-tauri/Cargo.toml").match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
const versions = {
  "package.json": pkg.version,
  "package-lock.json": lock.version,
  "package-lock.json root package": lock.packages?.[""]?.version,
  "tauri.conf.json": tauri.version,
  "Cargo.toml": cargo?.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  "Cargo.lock": read("src-tauri/Cargo.lock").match(/\[\[package\]\]\s+name = "copyy"\s+version = "([^"]+)"/)?.[1],
  "settings version": read("src/components/SettingsPanel.tsx").match(/Clipset <span className="muted">([^<]+)<\/span>/)?.[1],
};
const version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
  throw new Error(`Invalid release version: ${version}`);
}
for (const [file, actual] of Object.entries(versions)) {
  if (actual !== version) throw new Error(`${file}: expected ${version}, received ${actual}`);
}
const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  throw new Error(`Tag ${tag} does not match project version v${version}`);
}
console.log(version);
