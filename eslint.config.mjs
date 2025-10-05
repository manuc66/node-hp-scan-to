import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Prettier config to disable conflicting rules
  prettierConfig,

  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },

    files: ['src/**/*.ts'],

    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },

     rules: {
  //     // TypeScript specific rules
  //     '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  //     '@typescript-eslint/explicit-function-return-type': 'warn',
  //     '@typescript-eslint/no-explicit-any': 'warn',
  //     //'@typescript-eslint/prefer-const': 'error',
  //     '@typescript-eslint/no-var-requires': 'error',
  //
  //     // General ESLint rules
       'no-console': 'error',
       'no-debugger': 'error',
       'prefer-template': 'error',
  //     //'prefer-const': 'error',
  //     'no-var': 'error',
  //
  //     // Import rules
  //     'sort-imports': ['error', {
  //       'ignoreCase': false,
  //       'ignoreDeclarationSort': true,
  //       'ignoreMemberSort': false,
  //       'memberSyntaxSortOrder': ['none', 'all', 'multiple', 'single'],
  //     }],
     },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**/*',
      'test/**/*',
      'node_modules/**/*',
      '*.js',
      '*.mjs',
    ],
  }
);