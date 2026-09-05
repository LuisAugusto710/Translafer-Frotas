import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.resolve(dir, "src/vercel.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.resolve(dir, "dist/vercel-bundle"),
  outExtension: { ".js": ".mjs" },
  sourcemap: false,
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
  external: ["*.node", "pg-native"],
  banner: {
    js: `import { createRequire as __cr } from 'node:module'; import __path from 'node:path'; import __url from 'node:url'; globalThis.require = __cr(import.meta.url); globalThis.__filename = __url.fileURLToPath(import.meta.url); globalThis.__dirname = __path.dirname(globalThis.__filename);`,
  },
});
