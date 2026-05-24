// Metro config for npm workspaces monorepo.
// Reference: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so file changes in packages/core trigger reloads.
config.watchFolders = [workspaceRoot];

// Resolve modules from both the local app and the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// npm workspaces give a flat node_modules layout — disable the parent-dir
// walk so Metro doesn't accidentally pick up packages from outside the
// workspace.
config.resolver.disableHierarchicalLookup = true;

// @fundxi/core ships TypeScript source from packages/core/src, with no
// `exports` field and no build step. Without this alias Metro would try
// `node_modules/@fundxi/core/api/...` (which doesn't exist — the files
// live under /src/) and fail at runtime. Mirrors the vite alias in
// apps/web/vite.config.ts and the tsconfig path in apps/mobile.
config.resolver.alias = {
  ...(config.resolver.alias ?? {}),
  "@fundxi/core": path.resolve(workspaceRoot, "packages/core/src"),
};

module.exports = config;
