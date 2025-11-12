import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  target: "node20",
  splitting: false,
  clean: true,
  sourcemap: true,
  shims: true,
  minify: false,
  dts: true,
});
