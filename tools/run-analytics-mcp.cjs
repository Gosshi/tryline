// Codex can launch MCP servers from outside the repository. Normalize the
// working directory before loading the TypeScript runner, because the project
// uses the @/ module alias relative to its repository root.
const path = require("node:path");

process.chdir(path.resolve(__dirname, ".."));
process.argv = [
  process.argv[0],
  process.argv[1],
  "tools/analytics-mcp.ts",
  ...process.argv.slice(2),
];

require("./run-ts.cjs");
