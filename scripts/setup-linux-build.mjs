/**
 * Подготовка Linux VPS к next build (WASM/WASI вместо нативных .node).
 * Отключить: SMARTFLIP_NATIVE_BINARIES=1
 */
import { patchLightningcssToWasm, assertWasmToolchain, stripNativeBinaries, ensureTailwindOxideWasm } from "./strip-native-binaries.mjs";

function main() {
  if (process.platform !== "linux") return;
  if (process.env.SMARTFLIP_NATIVE_BINARIES === "1") {
    console.log("[setup-linux-build] SMARTFLIP_NATIVE_BINARIES=1 — пропуск");
    return;
  }

  console.log("[setup-linux-build] подготовка WASM/WASI fallback...");
  const removed = stripNativeBinaries();
  if (removed.length > 0) {
    for (const item of removed) console.log(`[setup-linux-build] удалён ${item}`);
  }
  ensureTailwindOxideWasm();
  patchLightningcssToWasm();
  assertWasmToolchain();
  console.log("[setup-linux-build] готово");
}

main();
