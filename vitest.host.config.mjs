import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@dsh-claude-style-plus/contracts': path.resolve(import.meta.dirname, 'packages/contracts/src') },
  },
  test: {
    include: ['packages/host/tests/**/*.test.ts'],
    environment: 'node',
  },
})
