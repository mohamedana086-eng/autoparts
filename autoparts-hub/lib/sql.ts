import 'server-only';
import { neon, Pool, types, type PoolClient } from '@neondatabase/serverless';

/**
 * Talking to Postgres.
 *
 * Two paths, because they answer different questions:
 *
 *   `sql`  — one statement, over HTTP. No connection to open or return, which
 *            is what makes it right on a platform where every request may be a
 *            cold function. Most reads are this.
 *
 *   `tx`   — several statements that must stand or fall together, over a
 *            WebSocket session. Row locks live for the length of a
 *            transaction, so anything taking `FOR UPDATE` has to be here.
 *
 * Both are tagged templates: an interpolated value becomes a bound parameter,
 * never text spliced into the statement. `sql`SELECT … WHERE id = ${id}`` sends
 * `WHERE id = $1`. There is deliberately no way to pass a whole query as a
 * string, so there is no comfortable way to write an injection.
 */

/**
 * Read TIMESTAMP columns as UTC.
 *
 * The schema's timestamps are `TIMESTAMP(3)` — no time zone — and the driver
 * parses those in the process's own zone, so the same stored row came back
 * three hours out on a machine at UTC+3 and exactly right on one at UTC. Prisma
 * always read them as UTC, which is also what wrote them, so this restores the
 * reading rather than changing it.
 *
 * Set once at module load: the parser is global to the driver, and doing it per
 * connection would leave whichever path ran first deciding the answer.
 */
const TIMESTAMP_OID = 1114;
types.setTypeParser(TIMESTAMP_OID, (value: string) =>
  // Postgres renders these without an offset; naming the zone the value is
  // already in is the whole fix.
  new Date(value.endsWith('Z') ? value : value.replace(' ', 'T') + 'Z')
);

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. The API cannot reach its database.');
  }
  return url;
}

/**
 * Rows come back as plain objects; the caller says what shape it expects.
 *
 * `object` rather than `Record<string, unknown>`: a declared interface does not
 * satisfy an index signature, and an interface is the natural way to write down
 * what a query returns. The constraint only needs to say "not a primitive".
 */
export type Row = object;

type Tagged = <T extends Row = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>;

/**
 * A single statement.
 *
 * Resolved lazily so that importing this module never reaches for an
 * environment variable — `next build` loads every route module, and a build
 * should not need the database any more than it needs the auth secret.
 */
let httpQuery: ReturnType<typeof neon> | null = null;

export const sql: Tagged = (strings, ...values) => {
  httpQuery ??= neon(connectionString());
  return httpQuery(strings, ...values) as never;
};

/**
 * One row, or null. The common shape of a lookup by id.
 *
 * Named rather than left to `rows[0]` at each call site because `rows[0]` on an
 * empty array is `undefined`, and `undefined` and `null` then mean the same
 * thing in some places and not others.
 */
export async function one<T extends Row = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const rows = await sql<T>(strings, ...values);
  return rows[0] ?? null;
}

/** Reads a single aggregate — COUNT, SUM — as a number. */
export async function scalar(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<number> {
  const rows = await sql(strings, ...values);
  const first = rows[0] ? Object.values(rows[0])[0] : 0;
  // COUNT comes back as a string from the driver: it is bigint in Postgres and
  // bigger than a JS number can hold in principle, so it is not silently cast.
  return Number(first ?? 0);
}

/** What a transaction body is handed. Same tagged template, same session. */
export interface Tx {
  sql: Tagged;
  one: <T extends Row = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T | null>;
  scalar: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  /** Rows affected by the last statement — how a conditional UPDATE reports. */
  affected: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
}

/** Turns a tagged call into ($1, $2 …) plus its values, the way the driver wants. */
function toQuery(strings: TemplateStringsArray, values: unknown[]) {
  let text = '';
  strings.forEach((part, i) => {
    text += part;
    if (i < values.length) text += `$${i + 1}`;
  });
  return { text, values };
}

function bind(client: PoolClient): Tx {
  const run = async <T extends Row>(strings: TemplateStringsArray, values: unknown[]) => {
    const { text, values: params } = toQuery(strings, values);
    const result = await client.query(text, params);
    return result;
  };

  return {
    sql: (async (strings, ...values) => (await run(strings, values)).rows) as Tagged,
    one: async (strings, ...values) => ((await run(strings, values)).rows[0] as never) ?? null,
    scalar: async (strings, ...values) => {
      const first = (await run(strings, values)).rows[0];
      return Number(first ? Object.values(first)[0] ?? 0 : 0);
    },
    affected: async (strings, ...values) => (await run(strings, values)).rowCount ?? 0,
  };
}

/**
 * Runs a body inside BEGIN/COMMIT, rolling back on any throw.
 *
 * A pool per call rather than a module-level one: on a serverless platform the
 * instance may be frozen the moment the response is sent, and a pool held
 * across invocations leaves sockets the runtime will not let it close. The
 * cost is one connection per transaction, which is the shape of the workload
 * anyway — transactions here are checkout and stock movements, not reads.
 */
export async function tx<T>(body: (t: Tx) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: connectionString() });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await body(bind(client));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    // Best effort: if the connection is already gone the rollback cannot land,
    // and the original error is the one worth reporting.
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** True when a thrown error is Postgres refusing on a named constraint. */
export function isConstraintViolation(e: unknown, code?: string): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const actual = (e as { code?: string }).code;
  return code ? actual === code : typeof actual === 'string' && actual.startsWith('23');
}

/** Unique violation — a duplicate key. */
export const UNIQUE_VIOLATION = '23505';
/** Check constraint refused the row. */
export const CHECK_VIOLATION = '23514';
