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

module.exports = config;
