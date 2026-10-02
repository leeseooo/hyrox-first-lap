import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', '.wrangler/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['*.config.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
];
