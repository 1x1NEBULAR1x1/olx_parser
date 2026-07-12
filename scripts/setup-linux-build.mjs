/**
 * Подготовка Linux VPS к next build, когда нативные бинарники дают Bus error:
 * - @next/swc-linux-*        → @next/swc-wasm-nodejs
 * - @tailwindcss/oxide-linux-* → NAPI_RS_FORCE_WASI (удаляем native до require)
 * - lightningcss-linux-*     → lightningcss-wasm (патч index.js)
 *
 * Отключить все fallback: SMARTFLIP_NATIVE_BINARIES=1
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root_dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nm = path.join(root_dir, "node_modules");

function readPackageVersion(dep_name, field = "dependencies") {
  const pkg_path = path.join(root_dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkg_path, "utf8"));
  const raw = pkg[field]?.[dep_name] ?? "";
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Не удалось определить версию ${dep_name} из package.json: "${raw}"`);
  }
  return match[1];
}

function removeDirsMatching(base_dir, predicate) {
  if (!fs.existsSync(base_dir)) return;
  for (const entry of fs.readdirSync(base_dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!predicate(entry.name)) continue;
    const target = path.join(base_dir, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[setup-linux-build] удалён ${path.relative(root_dir, target)}`);
  }
}

function npmInstall(package_spec) {
  execSync(`npm install ${package_spec} --no-save --no-fund --no-audit`, {
    cwd: root_dir,
    stdio: "inherit",
  });
}

function ensurePackage(package_name) {
  try {
    require.resolve(package_name);
    return true;
  } catch {
    return false;
  }
}

function setupSwcWasm(next_version) {
  removeDirsMatching(path.join(nm, "@next"), (name) => name.startsWith("swc-linux"));
  if (!ensurePackage("@next/swc-wasm-nodejs")) {
    console.log(`[setup-linux-build] установка @next/swc-wasm-nodejs@${next_version}...`);
    npmInstall(`@next/swc-wasm-nodejs@${next_version}`);
  }
}

function setupTailwindOxideWasi(tailwind_version) {
  removeDirsMatching(path.join(nm, "@tailwindcss"), (name) => (
    name.startsWith("oxide-linux")
    || name.startsWith("oxide-darwin")
    || name.startsWith("oxide-win32")
    || name.startsWith("oxide-freebsd")
    || name.startsWith("oxide-android")
    || name.startsWith("oxide-openharmony")
  ));

  if (!ensurePackage("@tailwindcss/oxide-wasm32-wasi")) {
    console.log(`[setup-linux-build] установка @tailwindcss/oxide-wasm32-wasi@${tailwind_version}...`);
    npmInstall(`@tailwindcss/oxide-wasm32-wasi@${tailwind_version}`);
  }
}

function setupLightningcssWasm() {
  removeDirsMatching(nm, (name) => name.startsWith("lightningcss-linux") || name.startsWith("lightningcss-darwin"));

  const lightningcss_dir = path.join(nm, "lightningcss");
  const native_node_file = path.join(lightningcss_dir, "lightningcss.linux-x64-gnu.node");
  if (fs.existsSync(native_node_file)) {
    fs.rmSync(native_node_file, { force: true });
  }

  if (!ensurePackage("lightningcss-wasm")) {
    console.log("[setup-linux-build] установка lightningcss-wasm@1.32.0...");
    npmInstall("lightningcss-wasm@1.32.0");
  }

  const patch_src = path.join(root_dir, "scripts/patches/lightningcss-index-wasm.cjs");
  const patch_dst = path.join(lightningcss_dir, "node/index.js");
  if (!fs.existsSync(patch_dst)) {
    throw new Error(`lightningcss не найден: ${patch_dst}`);
  }
  fs.copyFileSync(patch_src, patch_dst);
  console.log("[setup-linux-build] lightningcss → WASM patch применён");
}

function main() {
  if (process.platform !== "linux") return;
  if (process.env.SMARTFLIP_NATIVE_BINARIES === "1") {
    console.log("[setup-linux-build] SMARTFLIP_NATIVE_BINARIES=1 — нативные бинарники не трогаем");
    return;
  }

  const next_version = readPackageVersion("next");
  const tailwind_version = readPackageVersion("tailwindcss", "devDependencies");

  console.log("[setup-linux-build] подготовка WASM/WASI fallback для Linux VPS...");
  setupSwcWasm(next_version);
  setupTailwindOxideWasi(tailwind_version);
  setupLightningcssWasm();
  console.log("[setup-linux-build] готово. Запускайте: bash scripts/next-build.sh");
}

main();
