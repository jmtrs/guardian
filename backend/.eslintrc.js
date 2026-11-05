module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-types': 'off',
  },
  overrides: [
    {
      files: ['**/*.spec.ts', 'test/**/*.ts'],
      rules: { '@typescript-eslint/no-var-requires': 'off' },
    },
  ],
};
