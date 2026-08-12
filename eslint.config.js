// ESLint v9 flat config (plan Fix 0). Scope: TypeScript sources only.
// Rules aim for real defect detection on the existing codebase; style
// churn is deliberately avoided in the 0.5.1 hardening release.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js', '*.mjs'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // The codebase predates this config; `any` is pervasive at MCP tool
      // boundaries where args arrive untyped. Zod validates at runtime.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused vars are a real-defect signal; keep as error but allow the
      // conventional underscore escape for intentionally ignored values.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
];
