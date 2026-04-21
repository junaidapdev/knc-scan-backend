module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'prefer-const': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // The logger is the only place console.* is allowed — it wraps Winston's
      // console transport internally.
      files: ['src/lib/logger.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'build/', 'node_modules/', 'coverage/', 'tests/smoke/'],
};
