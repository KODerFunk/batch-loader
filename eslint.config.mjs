import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import unicorn from 'eslint-plugin-unicorn'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    name: 'app/ignores',
    // dist/ is bundled, machine-generated output (tsup): linting it fights esbuild's
    // canonical formatting and --fix rewrites would skew the source maps
    ignores: ['coverage/**', 'dist/**'],
  },

  // Former .eslint-configs/base.json (eslint:all + customization)
  js.configs.all,
  {
    name: 'app/base',
    rules: {
      'capitalized-comments': 'off',
      'class-methods-use-this': 'off',
      'consistent-return': 'off',
      'curly': ['error', 'multi-line'],
      'default-case': 'off',
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      'id-length': ['error', { exceptions: ['q', 'x', 'y'] }],
      'line-comment-position': 'off',
      'multiline-comment-style': 'off',
      'no-console': 'error',
      'no-duplicate-imports': 'off',
      'no-inline-comments': 'off',
      'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
      'no-ternary': 'off',
      'no-undefined': 'off',
      'no-use-before-define': ['error', { functions: false }],
      'no-void': 'off',
      'no-warning-comments': 'off',
      'one-var': ['error', 'never'],
      'require-unicode-regexp': 'off',
      'sort-imports': 'off',
      'sort-keys': 'off',
      'spaced-comment': 'off',
    },
  },

  // Formatting — unified via @stylistic (understands TS syntax),
  // core duplicates are disabled so the rules don't conflict
  {
    name: 'app/stylistic',
    plugins: { '@stylistic': stylistic },
    rules: {
      'array-element-newline': 'off',
      '@stylistic/array-element-newline': ['error', 'consistent'],
      'comma-dangle': 'off',
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      'dot-location': 'off',
      '@stylistic/dot-location': ['error', 'property'],
      'eol-last': 'off',
      '@stylistic/eol-last': 'error',
      'function-call-argument-newline': 'off',
      '@stylistic/function-call-argument-newline': ['error', 'consistent'],
      'function-paren-newline': 'off',
      '@stylistic/function-paren-newline': ['error', 'multiline-arguments'],
      'indent': 'off',
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      'multiline-ternary': 'off',
      '@stylistic/multiline-ternary': 'off',
      'no-extra-parens': 'off',
      '@stylistic/no-extra-parens': 'off',
      'no-mixed-operators': 'off',
      '@stylistic/no-mixed-operators': 'off',
      'no-multi-spaces': 'off',
      '@stylistic/no-multi-spaces': 'error',
      'no-multiple-empty-lines': 'off',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
      'no-trailing-spaces': 'off',
      '@stylistic/no-trailing-spaces': 'error',
      'object-curly-spacing': 'off',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      'object-property-newline': 'off',
      '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
      'operator-linebreak': 'off',
      '@stylistic/operator-linebreak': ['error', 'before', { overrides: { '=': 'after' } }],
      'padded-blocks': 'off',
      '@stylistic/padded-blocks': ['error', 'never'],
      'quote-props': 'off',
      '@stylistic/quote-props': ['error', 'consistent-as-needed'],
      'quotes': 'off',
      '@stylistic/quotes': ['error', 'single'],
      'semi': 'off',
      '@stylistic/semi': ['error', 'never'],
      'space-before-function-paren': 'off',
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always',
      }],
    },
  },

  // Former .eslint-configs/unicorn.json
  unicorn.configs['flat/all'],
  {
    name: 'app/unicorn',
    rules: {
      'unicorn/filename-case': ['error', {
        cases: { camelCase: true, pascalCase: true },
        ignore: ['\\.d\\.ts$'],
      }],
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-keyword-prefix': 'off',
      'unicorn/no-nested-ternary': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-useless-undefined': 'off',
      // index.ts is the package's legitimate public entrypoint, not a useless barrel
      'unicorn/no-barrel-files': 'off',
      // Error.isError is ES2026 (Node >= 22); the library supports older runtimes
      'unicorn/prefer-error-is-error': 'off',
      'unicorn/numeric-separators-style': ['error', { number: { minimumDigits: 4 } }],
      // The fixer conflicts with @stylistic/indent on nested arrow callbacks
      // (edit oscillation); implicit return is an established codebase convention
      'unicorn/consistent-arrow-return-style': 'off',
      // Codebase convention: private helpers go at the end of the class, after the public API
      'unicorn/consistent-class-member-order': ['error', {
        order: [
          'static-field',
          'static-block',
          'static-method',
          'private-field',
          'public-field',
          'constructor',
          'public-method',
          'private-method',
        ],
      }],
      'unicorn/prefer-top-level-await': 'off',
      // prevent-abbreviations is deprecated (moved to eslint-plugin-abbreviations)
      // and no longer accepts options; no allowlists needed
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  // Former .eslint-configs/typescript.json (plugin:@typescript-eslint/all)
  {
    files: ['src/**/*.ts'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ban-types removed; allow {} as in the old config
      '@typescript-eslint/no-empty-object-type': ['error', { allowObjectTypes: 'always' }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        disallowTypeAnnotations: false,
      }],
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      'init-declarations': 'off',
      'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
      'max-params': 'off',
      '@typescript-eslint/max-params': ['error', { max: 5 }],
      '@typescript-eslint/member-ordering': 'off',
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'none', requireLast: true },
        singleline: { delimiter: 'comma', requireLast: false },
        multilineDetection: 'brackets',
      }],
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/no-misused-promises': ['error', {
        checksConditionals: true,
        checksVoidReturn: {
          arguments: true,
          attributes: false,
          properties: true,
          returns: true,
          variables: true,
        },
      }],
      '@typescript-eslint/no-type-alias': 'off',
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': ['error', {
        ignore: [0],
        ignoreArrayIndexes: true,
        detectObjects: false,
      }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': ['error', {
        functions: false,
        classes: true,
        variables: true,
        enums: true,
        typedefs: true,
        ignoreTypeReferences: true,
      }],
      '@typescript-eslint/parameter-properties': ['error', { prefer: 'parameter-property' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/sort-type-constituents': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },
)
