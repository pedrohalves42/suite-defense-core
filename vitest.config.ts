import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    testTimeout: 30000,
    hookTimeout: 30000,
    isolate: false,
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'e2e/**',
      'contracts/**',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 20,
        statements: 20
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
