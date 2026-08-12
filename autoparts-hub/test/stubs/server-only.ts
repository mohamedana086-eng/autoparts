// Stands in for the `server-only` package under Vitest — see vitest.config.ts.
// The real one exists to throw when a server module is imported into a client
// bundle. There is no client here, so there is nothing to refuse.
export {};
