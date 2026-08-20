import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads `.env.local` then `.env` into `process.env`.
 *
 * The scripts here are run by `tsx`, which loads no env file of its own, and
 * Next only reads them for the application. Written out rather than pulled
 * from a package because a database url is not a thing to get from a
 * dependency: the failure mode of a subtly wrong parse is a migration or a
 * reseed pointed at the wrong database.
 *
 * Anything already in the environment wins, so CI can override the file.
 * Values may be quoted; nothing else about the format is interpreted, and a
 * line without an `=` is skipped rather than guessed at.
 */
export function loadEnv(): void {
  for (const name of ['.env.local', '.env']) {
    const file = join(process.cwd(), name);
    if (!existsSync(file)) continue;

    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq < 1) continue;

      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;

      let value = line.slice(eq + 1).trim();
      const quoted =
        value.length > 1 &&
        value[0] === value[value.length - 1] &&
        (value[0] === '"' || value[0] === "'");
      if (quoted) value = value.slice(1, -1);

      process.env[key] = value;
    }
  }
}
