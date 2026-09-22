const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Try resolving with project-wide node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// (pnpm: symlinks ya los resuelve Metro por defecto en SDK 57)

// Enable package exports to resolve subpath exports (e.g., semver/functions/satisfies)
config.resolver.unstable_enablePackageExports = true;

// Priorizar la versión de react-native y web sobre los módulos genéricos
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Add extraNodeModules to ensure semver is available for the bundler
config.resolver.extraNodeModules = {
  semver: path.resolve(projectRoot, 'node_modules/semver'),
};

module.exports = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
  configPath: path.resolve(projectRoot, '.rnstorybook'),
});
