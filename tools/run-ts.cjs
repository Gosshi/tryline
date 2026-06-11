const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const target = process.argv[2];

if (!target) {
  console.error("Usage: pnpm tsx <script.ts> [...args]");
  process.exit(1);
}

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (request.startsWith("@/")) {
    request = path.join(process.cwd(), request.slice(2));
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  // `import.meta` survives the CommonJS transpile as-is, which makes Node's
  // CJS loader reclassify the compiled output as ESM and crash on `exports`.
  // Rewrite it to the CJS equivalent so direct-run guards keep working.
  const patched = output.replace(
    /\bimport\.meta\.url\b/g,
    "require('node:url').pathToFileURL(__filename).href",
  );

  module._compile(patched, filename);
};

process.argv = [process.argv[0], target, ...process.argv.slice(3)];
require(path.resolve(process.cwd(), target));
