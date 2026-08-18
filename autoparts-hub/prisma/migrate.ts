/**
 * Applies the SQL migrations, in order, once each.
 * -------------------------------------------------
 * The migration files were always plain SQL — Prisma only ever ran them and
 * kept a note of which had gone in. This does the same two things and nothing
 * else, so removing the ORM costs no history.
 *
 * It reads that same note. `_prisma_migrations` already lists the thirteen
 * migrations this database has had, and re-running any of them would fail or
 * do damage, so the ledger is adopted rather than replaced. New migrations are
 * recorded in it the same way.
 *
 *   npm run db:deploy            apply anything outstanding
 *   npm run db:deploy -- --dry   list what would run, touch nothing
 *
 * Each file runs inside its own transaction: a migration that fails half way
 * leaves nothing behind, and is not written to the ledger, so fixing the file
 * and running again is the whole recovery procedure.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';

const DIR = join(process.cwd(), 'prisma', 'migrations');

/** The ledger Prisma wrote, kept so an existing database is not re-migrated. */
const LEDGER = '_prisma_migrations';

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

function pending(applied: Set<string>): Migration[] {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .filter((name) => !applied.has(name))
    .map((name) => {
      const file = join(DIR, name, 'migration.sql');
      if (!existsSync(file)) throw new Error(`${name} has no migration.sql`);
      const sql = readFileSync(file, 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const dry = process.argv.includes('--dry');

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // Same shape Prisma created, so an existing ledger is used as it stands
    // and a fresh database gets one that looks no different.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${LEDGER}" (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    const done = await client.query<{ migration_name: string }>(
      `SELECT "migration_name" FROM "${LEDGER}" WHERE "finished_at" IS NOT NULL`
    );
    const applied = new Set(done.rows.map((r) => r.migration_name));
    console.log(`${applied.size} migration${applied.size === 1 ? '' : 's'} already applied`);

    const outstanding = pending(applied);
    if (outstanding.length === 0) {
      console.log('Nothing to apply.');
      return;
    }

    console.log(`${outstanding.length} to apply:`);
    for (const m of outstanding) console.log(`  ${m.name}`);
    if (dry) {
      console.log('\n--dry: nothing was run.');
      return;
    }

    for (const m of outstanding) {
      process.stdout.write(`\napplying ${m.name} ... `);
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          `INSERT INTO "${LEDGER}" ("id","checksum","migration_name","finished_at","applied_steps_count")
           VALUES ($1,$2,$3,now(),1)`,
          [randomUUID(), m.checksum, m.name]
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('failed');
        // Not recorded, so the fixed file simply runs again next time.
        throw e;
      }
    }

    console.log('\nAll migrations applied.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\n' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
