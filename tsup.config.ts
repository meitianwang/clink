import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true,
  external: ["better-sqlite3"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
