import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/bazel-*/**',
      '**/dist/**',
      '**/generated/**',
      'apps/android/**/build/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // CJS config files (jest.config.cjs, postcss.config.js, tailwind.config.js)
  {
    files: ['**/*.{cjs,js}'],
    languageOptions: {
      globals: { module: 'writable', require: 'writable', __dirname: 'readonly' },
    },
    rules: { 'no-undef': 'off' },
  },

  // MJS wrapper files (vite-wrapper.mjs, vitest-wrapper.mjs)
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // All TS projects: server, shared, db, client-ts, api-spec, pos
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Disable rules that would cause massive churn
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
      'no-control-regex': 'off',
      'no-useless-catch': 'off',
    },
  },

  // CommonJS packages (server, shared, db, client-ts, client-kt)
  {
    files: [
      'apps/server/**/*.ts',
      'packages/shared/**/*.ts',
      'packages/db/**/*.ts',
      'packages/client-ts/**/*.ts',
      'packages/client-kt/**/*.ts',
    ],
    rules: {
      // NestJS decorators use empty classes/interfaces — suppress false positives
      '@typescript-eslint/no-empty-object-type': 'off',
      // NestJS DI uses parameter properties (private readonly in constructor)
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
    },
  },

  // React (apps/pos)
  {
    files: ['apps/pos/**/*.{ts,tsx}'],
    plugins: { react: reactPlugin },
    settings: { react: { version: '18' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 18 JSX transform
      'react/prop-types': 'off', // TS handles this
    },
  },
);
