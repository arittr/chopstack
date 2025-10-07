import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importXPlugin from 'eslint-plugin-import-x';
import perfectionist from 'eslint-plugin-perfectionist';
// @ts-expect-error No types for this plugin
import promisePlugin from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';

import aliasPlugin from './tools/eslint/alias-plugin';
import guardsPlugin from './tools/eslint/guards-plugin';

const relativeImportPathRestrictions = [
  {
    group: ['../*'],
    message:
      'Use absolute imports (@/) instead of relative imports unless importing from the same directory',
  },
];

const config: Record<string, unknown>[] = [
  // Base JavaScript recommendations
  js.configs.recommended,
  // Disable formatting-related rules to defer to Prettier
  eslintConfigPrettier,

  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.chopstack/**',
      'coverage/**',
      'test/tmp/**',
    ],
  },

  // TypeScript configuration
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        global: 'readonly',
        process: 'readonly',
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        project: './tsconfig.json',
        sourceType: 'module',
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      alias: aliasPlugin,
      guards: guardsPlugin,
      'import-x': importXPlugin,
      perfectionist,
      promise: promisePlugin,
      unicorn,
    } as Record<string, unknown>,
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-exports': [
        'error',
        {
          fixMixedExportsWithInlineTypeSpecifier: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'separate-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowDirectConstAssertionInArrowFunctions: true,
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      // Naming conventions
      '@typescript-eslint/naming-convention': [
        'error',
        {
          format: ['camelCase', 'PascalCase'],
          selector: 'import',
        },
        {
          format: ['camelCase'],
          selector: 'default',
        },
        {
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          selector: 'variable',
        },
        {
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          selector: 'parameter',
        },
        {
          format: ['camelCase'],
          leadingUnderscore: 'require',
          modifiers: ['private'],
          selector: 'memberLike',
        },
        {
          format: ['PascalCase'],
          selector: 'typeLike',
        },
        {
          format: ['camelCase', 'UPPER_CASE'],
          modifiers: ['readonly'],
          selector: 'property',
        },
        {
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          selector: 'objectLiteralProperty',
        },
        {
          format: ['UPPER_CASE'],
          selector: 'enumMember',
        },
        {
          custom: {
            match: false,
            regex: '^I[A-Z]',
          },
          format: ['PascalCase'],
          selector: 'interface',
        },
        // Allow colon notation for event type properties (e.g., 'stream:data', 'task:complete')
        {
          custom: {
            match: true,
            regex: '^[a-z]+:[a-z-]+$',
          },
          filter: {
            match: true,
            regex: ':',
          },
          format: null,
          selector: 'typeProperty',
        },
        // Allow standard camelCase for other type properties
        {
          filter: {
            match: false,
            regex: ':',
          },
          format: ['camelCase', 'PascalCase'],
          selector: 'typeProperty',
        },
      ],
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      // TypeScript-specific rules (very strict)
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [...relativeImportPathRestrictions],
        },
      ],
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off', // Too strict for most cases
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowAny: false,
          allowNullableBoolean: false,
          allowNullableNumber: false,
          allowNullableObject: false,
          allowNullableString: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unified-signatures': 'error',
      'alias/prefer-alias-imports': 'error',
      // Stylistic rules
      curly: ['error', 'all'],
      'dot-notation': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'guards/prefer-guards-defined': 'off', // TODO: enable this and fix the issues in batch
      'import-x/default': 'off', // TypeScript handles this
      'import-x/first': 'error',
      'import-x/named': 'off', // TypeScript handles this
      'import-x/namespace': 'off', // TypeScript handles this
      'import-x/newline-after-import': 'error',
      'import-x/no-default-export': 'error',
      'import-x/no-duplicates': 'error',
      // ESM/CJS hygiene
      'import-x/no-import-module-exports': 'error',
      'import-x/no-named-as-default': 'off', // TypeScript handles this
      'import-x/no-named-as-default-member': 'off', // TypeScript handles this
      // Import/Export rules
      'import-x/no-unresolved': 'off', // TypeScript handles this
      'import-x/order': 'off', // Disabled in favor of perfectionist/sort-imports
      'import-x/prefer-default-export': 'off',
      'no-alert': 'error',
      'no-await-in-loop': 'off', // creates too much noise
      // Core ESLint rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-else-return': 'error',
      'no-implied-eval': 'error',
      'no-lonely-if': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-return-await': 'off', // Handled by @typescript-eslint/return-await
      // Runtime-strictness additions
      'no-throw-literal': 'error',
      'no-unneeded-ternary': 'error',
      // Disable base rule in favor of @typescript-eslint version
      'no-unused-vars': 'off',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'operator-assignment': 'error',
      'perfectionist/sort-exports': [
        'error',
        {
          order: 'asc',
          type: 'natural',
        },
      ],
      // Perfectionist (sorting) rules
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            'type',
            'builtin',
            'external',
            'internal-type',
            'internal',
            'parent-type',
            'parent',
            'sibling-type',
            'sibling',
            'index-type',
            'index',
            'object',
            'unknown',
          ],
          internalPattern: ['^@/', '^../types/', '^./types/'],
          newlinesBetween: 'always',
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-interfaces': [
        'error',
        {
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-named-imports': [
        'error',
        {
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-object-types': [
        'error',
        {
          order: 'asc',
          type: 'natural',
        },
      ],
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',
      'prefer-destructuring': [
        'error',
        {
          array: false,
          object: true,
        },
      ],
      'prefer-exponentiation-operator': 'error',
      'prefer-numeric-literals': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-regex-literals': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      // Promise rules
      'promise/always-return': 'error',
      'promise/avoid-new': 'off',
      // Promise correctness
      'promise/catch-or-return': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/no-multiple-resolved': 'error',
      'promise/no-nesting': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/prefer-await-to-callbacks': 'error',
      'promise/prefer-await-to-then': 'error',
      'promise/valid-params': 'error',
      'require-await': 'off', // Handled by @typescript-eslint/require-await
      'spaced-comment': [
        'error',
        'always',
        {
          markers: ['/'],
        },
      ],
      // Unicorn rules (modern JavaScript practices)
      'unicorn/better-regex': 'error',
      'unicorn/catch-error-name': 'error',
      'unicorn/consistent-destructuring': 'error',
      'unicorn/consistent-function-scoping': 'error',
      'unicorn/custom-error-definition': 'error',
      'unicorn/error-message': 'error',
      'unicorn/escape-case': 'error',
      'unicorn/expiring-todo-comments': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            camelCase: true,
            kebabCase: true,
            pascalCase: true,
          },
        },
      ],
      'unicorn/new-for-builtins': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-array-callback-reference': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-console-spaces': 'error',
      'unicorn/no-for-loop': 'error',
      'unicorn/no-hex-escape': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-new-array': 'error',
      'unicorn/no-new-buffer': 'error',
      'unicorn/no-null': 'off', // Allow null for DOM APIs
      'unicorn/no-object-as-default-parameter': 'error',
      // Misc safety
      'unicorn/no-process-exit': 'error',
      'unicorn/no-static-only-class': 'error',
      'unicorn/no-thenable': 'error',
      'unicorn/no-this-assignment': 'error',
      'unicorn/no-unnecessary-await': 'error',
      'unicorn/no-unreadable-array-destructuring': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-unused-properties': 'error',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-useless-length-check': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/no-useless-spread': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/number-literal-case': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/prefer-add-event-listener': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/prefer-code-point': 'error',
      'unicorn/prefer-date-now': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-json-parse-buffer': 'error',
      'unicorn/prefer-logical-operator-over-ternary': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-modern-dom-apis': 'error',
      'unicorn/prefer-modern-math-apis': 'error',
      'unicorn/prefer-native-coercion-functions': 'error',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-prototype-methods': 'error',
      'unicorn/prefer-query-selector': 'error',
      'unicorn/prefer-reflect-apply': 'error',
      'unicorn/prefer-regexp-test': 'error',
      'unicorn/prefer-set-has': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-switch': 'error',
      'unicorn/prefer-ternary': 'error',
      'unicorn/prefer-top-level-await': 'error',
      'unicorn/prefer-type-error': 'error',
      'unicorn/prevent-abbreviations': [
        'error',
        {
          replacements: {
            args: false,
            ctx: false,
            dir: false,
            env: false,
            params: false,
            props: false,
            ref: false,
            temp: false,
            tmp: false,
          },
        },
      ],
      'unicorn/relative-url-style': 'error',
      'unicorn/require-array-join-separator': 'error',
      'unicorn/require-number-to-fixed-digits-argument': 'error',
      'unicorn/require-post-message-target-origin': 'error',
      'unicorn/string-content': 'error',
      'unicorn/switch-case-braces': 'error',
      'unicorn/text-encoding-identifier-case': 'error',
      'unicorn/throw-new-error': 'error',
      yoda: 'error',
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },

  // React/TSX configuration
  {
    files: ['**/*.tsx', 'src/ui/**/*.ts'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        jsx: true,
      },
    },
    rules: {
      // Allow type imports in TSX
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          disallowTypeAnnotations: false,
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],

      // React Hooks rules (if you add eslint-plugin-react-hooks)
      // 'react-hooks/rules-of-hooks': 'error',
      // 'react-hooks/exhaustive-deps': 'warn',

      // Allow JSX expressions
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
        },
      ],

      // Allow arrow functions for components
      '@typescript-eslint/no-empty-function': [
        'error',
        {
          allow: ['arrowFunctions'],
        },
      ],

      // React-specific rules for TSX files
      // Allow JSX syntax
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],

      // More lenient for React components
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowAny: false,
          allowNullableBoolean: false,
          allowNullableEnum: true, // Allow for conditional rendering
          allowNullableNumber: false,
          allowNullableObject: false,
          allowNullableString: false,
          allowNumber: false,
          allowString: false,
        },
      ],

      // Import ordering for React
      'perfectionist/sort-imports': [
        'error',
        {
          customGroups: {
            value: {
              react: ['react', 'react-*'],
              'react-dom': ['react-dom', 'react-dom/*'],
            },
          },
          groups: [
            'type',
            ['builtin', 'react', 'react-dom'], // React imports first
            'external',
            'internal-type',
            'internal',
            'parent-type',
            'parent',
            'sibling-type',
            'sibling',
            'index-type',
            'index',
            'object',
            'unknown',
          ],
          internalPattern: ['^@/', '^../types/', '^./types/'],
          newlinesBetween: 'always',
          order: 'asc',
          type: 'natural',
        },
      ],
      // Allow fragments and JSX elements
      'unicorn/no-null': 'off', // React uses null for empty renders

      'unicorn/no-useless-undefined': 'off', // Sometimes needed in React
    },
    settings: {
      react: {
        version: '18.0',
      },
    },
  },

  // JavaScript files configuration (less strict)
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      // Disable TypeScript-specific rules for JS files
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unsafe-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  // Test files configuration (slightly relaxed)
  {
    files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/tests/**/*', '**/__tests__/**/*', 'test/**/*'],
    languageOptions: {
      globals: {
        afterAll: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'no-console': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  // Configuration files (targeted relaxation)
  {
    files: ['*.config.{js,ts,mjs}', '.*rc.{js,ts}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        process: 'readonly',
        // Add common config file globals
        URL: 'readonly',
      },
    },
    plugins: {
      'import-x': importXPlugin,
      perfectionist,
    },
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      'import-x/no-default-export': 'off', // Config files commonly export default
      // Essential relaxations for config files
      'perfectionist/sort-objects': ['error', { order: 'asc', type: 'natural' }],

      'unicorn/prefer-module': 'off', // Config files may need CommonJS
      // Targeted relaxations for specific patterns
      'unicorn/relative-url-style': 'off', // For new URL('./path', import.meta.url)
    },
  },
];

export default config;
