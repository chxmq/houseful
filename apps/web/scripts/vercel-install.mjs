import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const vendorDir = existsSync(new URL("../vendor", import.meta.url)) ? "vendor" : ".vendor";
pkg.dependencies["@houseful/contracts"] = `file:./${vendorDir}/contracts`;
pkg.dependencies["@houseful/pass"] = `file:./${vendorDir}/pass`;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

for (const name of [`${vendorDir}/contracts`, `${vendorDir}/pass`]) {
  const path = new URL(`../${name}/package.json`, import.meta.url);
  if (!existsSync(path)) continue;
  const nested = JSON.parse(readFileSync(path, "utf8"));
  delete nested.devDependencies;
  delete nested.scripts;
  writeFileSync(path, `${JSON.stringify(nested, null, 2)}\n`);
}

for (const name of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
  const p = new URL(`../${name}`, import.meta.url);
  if (existsSync(p)) rmSync(p);
}

// Keep devDependencies so Tailwind/Turbopack and TypeScript are available for `next build`.
const install = spawnSync("npm", ["install", "--legacy-peer-deps"], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
});
process.exit(install.status ?? 1);
