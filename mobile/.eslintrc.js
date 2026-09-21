module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  env: {
    node: true,
    es6: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
    'import/no-relative-parent-imports': 'error',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.expo/',
    'storybook-static/',
    'babel.config.js',
    'metro.config.js',
  ],
  overrides: [
    {
      files: ['app/dev/storybook.tsx', '.rnstorybook/preview.tsx'],
      rules: {
        'import/no-relative-parent-imports': 'off',
      },
    },
  ],
};
