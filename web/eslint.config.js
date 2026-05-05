import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const browserGlobals = {
  AudioContext: 'readonly',
  Blob: 'readonly',
  CanvasRenderingContext2D: 'readonly',
  Event: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  HTMLAudioElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  HTMLImageElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLMediaElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  Image: 'readonly',
  MediaStream: 'readonly',
  MediaStreamAudioSourceNode: 'readonly',
  Notification: 'readonly',
  NotificationPermission: 'readonly',
  PointerEvent: 'readonly',
  ScriptProcessorNode: 'readonly',
  URL: 'readonly',
  Window: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  window: 'readonly'
};

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: browserGlobals
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true
        }
      ]
    }
  },
  {
    files: ['vite.config.ts', 'src/**/*.test.ts'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        process: 'readonly'
      }
    }
  },
  {
    files: ['src/context/AppContext.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  }
);
