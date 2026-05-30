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

// Keep Metro's hierarchical (parent-dir) lookup enabled. npm does NOT always
// hoist every transitive dependency to the workspace root — e.g. several of
// `expo`'s own deps (expo-asset, expo-file-system, babel-preset-expo, ...)
// land nested under node_modules/expo/node_modules. Disabling the walk-up
// makes those nested packages unresolvable ("Unable to resolve expo-asset").
// The official Expo monorepo guide leaves hierarchical lookup on.
config.resolver.disableHierarchicalLookup = false;

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
