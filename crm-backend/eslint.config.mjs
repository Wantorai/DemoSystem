import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'logs/**',
      'uploads/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-extra-boolean-cast': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'eqeqeq': ['warn', 'smart'],
    },
  },
  {
    files: ['migrations/**/*.js', 'seeders/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.test.js', '**/*.spec.js', 'test/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.jest,
      },
    },
  },
];
