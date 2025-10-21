import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['plugins/plugin-manifest.json'],
  },
  js.configs.recommended,
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          importAssertions: true,
        },
      },
      globals: {
        ...globals.worker,
      },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
