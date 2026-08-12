import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // The same `@/...` paths tsconfig maps, so a test imports a module by
      // the name the application uses rather than by a relative path that
      // would have to be rewritten every time a file moves.
      '@': path.resolve(import.meta.dirname),

      // `server-only` is a guard, not a dependency: it throws when a module
      // that must stay on the server is pulled into a client bundle. Under
      // Node there is no bundle and no client, so the guard has nothing to
      // catch and only stops the module loading at all. Stubbed to nothing.
      'server-only': path.resolve(import.meta.dirname, 'test/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    // Only the pure modules are covered here. Anything that reaches the
    // database is left to the API tests rather than faked: a mocked Prisma
    // proves the mock behaves, not the query.
    include: ['test/**/*.test.ts'],
  },
});
