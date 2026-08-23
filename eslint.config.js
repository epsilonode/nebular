import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import functional from 'eslint-plugin-functional';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const productionFiles = ['teleport.ts', 'broker-client.ts', 'recipe-runner.ts', 'broker.ts', 'src/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      '.generated/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'reports/**',
      'src/**/__lint_negative__/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { boundaries, functional },
    rules: {
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'functional/no-class-inheritance': 'error',
      'functional/no-classes': 'error',
      'functional/no-mixed-types': 'error',
      'functional/no-promise-reject': 'error',
      'functional/prefer-immutable-types': ['error', {
        enforcement: 'ReadonlyShallow',
        overrides: [{
          specifiers: { from: 'file' },
          options: { ignoreInferredTypes: true, parameters: { enforcement: 'ReadonlyShallow' } }
        }]
      }],
      'functional/prefer-property-signatures': 'error',
      'functional/type-declaration-immutability': ['error', {
        rules: [{ identifiers: ['.+'], immutability: 'ReadonlyShallow', comparator: 'AtLeast' }]
      }]
    }
  },
  {
    files: productionFiles,
    ignores: ['**/*.test.ts'],
    languageOptions: { globals: globals.browser },
    settings: {
      'boundaries/elements': [
        { type: 'teleport', pattern: 'src/teleport/**' },
        { type: 'broker-client', pattern: 'src/broker-client/**' },
        { type: 'recipe-runner', pattern: 'src/recipe-runner/**' },
        { type: 'broker', pattern: 'src/broker/**' }
      ]
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          {
            from: { element: { type: 'teleport' } },
            allow: { to: { element: { type: 'teleport' } } }
          },
          {
            from: { element: { type: 'broker-client' } },
            allow: { to: { element: { types: ['teleport', 'broker-client'] } } }
          },
          {
            from: { element: { type: 'recipe-runner' } },
            allow: { to: { element: { types: ['teleport', 'broker-client', 'recipe-runner'] } } }
          },
          {
            from: { element: { type: 'broker' } },
            allow: { to: { element: { types: ['teleport', 'broker-client', 'broker'] } } }
          }
        ]
      }],
      'functional/immutable-data': 'error',
      'functional/no-let': 'error',
      'functional/no-loop-statements': 'error',
      'functional/no-this-expressions': 'error',
      'functional/no-throw-statements': 'error',
      'functional/no-try-statements': 'error',
      'functional/prefer-tacit': 'off',
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.property.name='catch']",
        message: 'Map rejected effects through typed outcomes; do not erase failures with Promise.catch.'
      }],
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^(?:\\.\\./)+(?:teleport|broker-client|recipe-runner|broker)/(?!public\\.ts$)',
          message: 'Cross-domain imports must use the owning domain public.ts surface.'
        }]
      }]
    }
  },
  {
    files: ['teleport.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^\\./src/(?!teleport/public\\.ts$)',
          message: 'teleport.ts may compose only the Teleport public surface.'
        }]
      }]
    }
  },
  {
    files: ['broker-client.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^\\./src/(?!broker-client/public\\.ts$)',
          message: 'broker-client.ts may compose only the broker-client public surface.'
        }]
      }]
    }
  },
  {
    files: ['recipe-runner.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^\\./src/(?!(?:recipe-runner|broker-client)/public\\.ts$)',
          message: 'recipe-runner.ts may compose only its permitted public domain surfaces.'
        }]
      }]
    }
  },
  {
    files: ['broker.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^\\./src/(?!broker/public\\.ts$)',
          message: 'broker.ts may compose only the broker public surface.'
        }]
      }]
    }
  },
  {
    files: ['src/teleport/**/*.ts', 'teleport.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'Bun', message: 'The portable Teleport domain cannot use Bun authority.' },
        { name: 'console', message: 'Portable code returns typed diagnostics instead of logging.' },
        { name: 'fetch', message: 'Portable code receives transport effects through ports.' },
        { name: 'process', message: 'The portable Teleport domain cannot use process authority.' }
      ]
    }
  },
  {
    files: ['src/teleport/browser-device-key-provider.ts'],
    rules: {
      // IndexedDB is an evented stateful foreign API; the adapter keeps typed
      // immutable inputs/outcomes while confining lifecycle mutation here.
      'functional/immutable-data': 'off',
      'functional/no-classes': 'off',
      'functional/no-let': 'off',
      'functional/no-promise-reject': 'off',
      'functional/no-this-expressions': 'off',
      'functional/no-throw-statements': 'off',
      'functional/no-try-statements': 'off',
      'functional/prefer-immutable-types': 'off'
    }
  },
  {
    files: ['src/broker-client/primitives.ts'],
    rules: {
      // Branded primitive assertions are confined to total constructors.
      '@typescript-eslint/no-unsafe-type-assertion': 'off'
    }
  },
  {
    files: ['src/broker-client/inherited-ipc.ts'],
    rules: {
      // Bun IPC is callback-driven and exposes mutable subprocess handles.
      // The adapter confines those mechanics behind the pure exchange reducer.
      'functional/immutable-data': 'off',
      'functional/no-let': 'off',
      'functional/prefer-immutable-types': 'off'
    }
  },
  {
    files: ['src/broker-client/result.ts'],
    rules: {
      // neverthrow Result/ResultAsync are foreign class-backed values; the
      // client error algebra and every public input remain readonly.
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off'
    }
  },
  {
    files: ['src/broker/primitives.ts'],
    rules: {
      // Branded primitive assertions are confined to total constructors.
      '@typescript-eslint/no-unsafe-type-assertion': 'off'
    }
  },
  {
    files: [
      'src/broker/result.ts',
      'src/broker/authority.ts',
      'src/broker/bun-inherited-ipc.ts',
      'src/broker/bun-secret-store.ts',
      'src/broker/effect-runtime.ts',
      'src/broker/lease.ts',
      'src/broker/operation.ts',
      'src/broker/receiver.ts',
      'src/broker/secret-delivery.ts'
    ],
    rules: {
      // neverthrow ResultAsync is implemented as a class but represents the
      // broker's typed effect value; observable domain inputs remain readonly.
      'functional/prefer-immutable-types': 'off'
    }
  },
  {
    files: ['src/broker/bun-inherited-ipc.ts'],
    rules: {
      // Bun child IPC is callback/timer driven. Mutable listener and deadline
      // cells are confined here; messages are decoded before policy executes.
      'functional/immutable-data': 'off',
      'functional/no-let': 'off'
    }
  },
  {
    files: ['src/broker/bun-sqlite-journal.ts'],
    rules: {
      // The Bun SQLite module and Database handles are mutable foreign values.
      // The adapter confines them to one operation-scoped open/close lifecycle.
      'functional/prefer-immutable-types': 'off'
    }
  },
  {
    files: ['src/broker/result.ts', 'src/broker/lease.ts'],
    rules: {
      // neverthrow Result/ResultAsync declarations are foreign class-backed
      // values; domain issue and state records remain readonly.
      'functional/type-declaration-immutability': 'off'
    }
  },
  {
    files: ['src/broker-client/ipc.ts'],
    rules: {
      // Zod schema objects are mutable foreign registry values. Decoded public
      // projections are reconstructed into readonly domain messages.
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off'
    }
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
    rules: {
      'functional/immutable-data': 'off',
      'functional/no-let': 'off',
      'functional/no-loop-statements': 'off',
      'functional/no-classes': 'off',
      'functional/no-promise-reject': 'off',
      'functional/no-throw-statements': 'off',
      'functional/no-try-statements': 'off',
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off'
    }
  },
  {
    files: ['src/broker/bun-sqlite-journal.test.ts'],
    rules: {
      // bun:test exposes matcher inputs as any; this host-only suite keeps
      // typed fixtures and confines that erasure to assertion calls.
      '@typescript-eslint/no-unsafe-argument': 'off'
    }
  },
  {
    files: ['vitest*.ts', 'tooling/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'functional/immutable-data': 'off',
      'functional/no-loop-statements': 'off',
      'functional/no-throw-statements': 'off',
      'functional/no-try-statements': 'off',
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off'
    }
  }
);
