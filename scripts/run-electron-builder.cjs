// Cross-platform electron-builder runner: sets the code-signing discovery flag that the
// old npm scripts passed with the POSIX-only `VAR=value command` syntax, which cmd.exe
// (npm's shell on Windows) rejected — every `npm run build` failed on Windows.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const bin = process.platform === "win32" ? "electron-builder.CMD" : "electron-builder";
const candidates = [
  path.join(root, "packages", "agent-desktop", "node_modules", ".bin", bin),
  path.join(root, "packages", "server-desktop", "node_modules", ".bin", bin),
  path.join(root, "node_modules", ".bin", bin),
];
const found = candidates.find((p) => fs.existsSync(p));
if (!found) {
  console.error("run-electron-builder: electron-builder binary not found in " + candidates.join(", "));
  process.exit(1);
}
const env = Object.assign({}, process.env, {
  CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || "false",
});
const res = spawnSync(found, process.argv.slice(2), { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(res.status === null ? 1 : res.status);
