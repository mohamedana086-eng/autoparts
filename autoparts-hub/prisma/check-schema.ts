/**
 * Checks schema.prisma against the migrations.
 * --------------------------------------------
 * Nothing generates from schema.prisma any more — the migrations in
 * ./migrations are what the database is actually built from. That makes the
 * schema file documentation, and documentation nothing checks is documentation
 * that will be wrong within a month. This is the thing that checks it.
 *
 *   npm run db:check
 *
 * It needs no database. The migrations are replayed symbolically — every
 * CREATE TABLE and ADD COLUMN applied to an in-memory picture of the schema —
 * and that picture is compared against the models in schema.prisma.
 *
 * Any SQL it does not recognise is an error, not something skipped. A checker
 * that quietly ignores what it cannot parse reports success it has not earned,
 * and the first migration to use an unfamiliar statement would be the one it
 * stopped covering.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const SCHEMA = join(process.cwd(), 'prisma', 'schema.prisma');

interface Column {
  name: string;
  type: string;
  nullable: boolean;
}

type Tables = Map<string, Map<string, Column>>;

/* ------------------------------------------------- replaying the SQL --- */

/** Statements that change no table or column. Matched, then ignored. */
const IRRELEVANT = [
  /^CREATE (UNIQUE )?INDEX/i,
  /^CREATE EXTENSION/i,
  /^DROP INDEX/i,
  /^COMMENT ON/i,
  /^UPDATE\s/i,
  /^INSERT\s/i,
  /^DELETE\s/i,
  /^SELECT\s/i,
];

/** Postgres spellings normalised to one form, so TEXT and text compare equal. */
function normaliseType(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^TIMESTAMP(\(\d+\))?( WITHOUT TIME ZONE)?$/.test(t)) return 'TIMESTAMP';
  if (t === 'DOUBLE PRECISION') return 'DOUBLE PRECISION';
  if (t === 'TEXT[]') return 'TEXT[]';
  return t;
}

/** One column definition from inside a CREATE TABLE, or from ADD COLUMN. */
function parseColumn(line: string): Column | null {
  const m = line.match(/^"([^"]+)"\s+(.+)$/);
  if (!m) return null;

  const [, name, rest] = m;
  // Everything after the type is defaults and constraints. The type is the
  // leading run, up to NOT NULL / DEFAULT / a constraint keyword.
  const typeMatch = rest.match(
    /^((?:[A-Za-z ]+?)(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])?)(?=\s+(?:NOT NULL|NULL|DEFAULT|PRIMARY|REFERENCES|UNIQUE|CHECK|GENERATED)\b|\s*$)/i
  );
  if (!typeMatch) return null;

  return {
    name,
    type: normaliseType(typeMatch[1]),
    nullable: !/\bNOT NULL\b/i.test(rest),
  };
}

function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function replayMigrations(): Tables {
  const tables: Tables = new Map();
  const names = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const name of names) {
    const file = join(MIGRATIONS, name, 'migration.sql');
    for (const statement of splitStatements(readFileSync(file, 'utf8'))) {
      const flat = statement.replace(/\s+/g, ' ').trim();

      if (IRRELEVANT.some((r) => r.test(flat))) continue;

      const created = statement.match(/^CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"\s*\(([\s\S]*)\)$/i);
      if (created) {
        const [, table, body] = created;
        const columns = new Map<string, Column>();
        // Split on commas that are not inside brackets, so NUMERIC(10,2) and
        // PRIMARY KEY ("a","b") survive intact.
        let depth = 0;
        let current = '';
        const parts: string[] = [];
        for (const ch of body) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
          } else current += ch;
        }
        parts.push(current);

        for (const part of parts) {
          const line = part.trim();
          if (!line || /^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b/i.test(line)) continue;
          const column = parseColumn(line);
          if (!column) throw new Error(`${name}: cannot read column definition: ${line}`);
          columns.set(column.name, column);
        }
        tables.set(table, columns);
        continue;
      }

      const addColumn = flat.match(
        /^ALTER TABLE "([^"]+)" ADD COLUMN(?: IF NOT EXISTS)? (.+)$/i
      );
      if (addColumn) {
        const [, table, definition] = addColumn;
        const columns = tables.get(table);
        if (!columns) throw new Error(`${name}: ADD COLUMN on unknown table ${table}`);
        const column = parseColumn(definition.trim());
        if (!column) throw new Error(`${name}: cannot read ADD COLUMN: ${definition}`);
        columns.set(column.name, column);
        continue;
      }

      const dropColumn = flat.match(/^ALTER TABLE "([^"]+)" DROP COLUMN(?: IF EXISTS)? "([^"]+)"/i);
      if (dropColumn) {
        tables.get(dropColumn[1])?.delete(dropColumn[2]);
        continue;
      }

      const setNotNull = flat.match(
        /^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" (SET|DROP) NOT NULL$/i
      );
      if (setNotNull) {
        const [, table, column, verb] = setNotNull;
        const existing = tables.get(table)?.get(column);
        if (!existing) throw new Error(`${name}: ALTER COLUMN on unknown ${table}.${column}`);
        existing.nullable = verb.toUpperCase() === 'DROP';
        continue;
      }

      const setType = flat.match(
        /^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" (?:SET DATA )?TYPE ([^,]+?)(?: USING .+)?$/i
      );
      if (setType) {
        const [, table, column, type] = setType;
        const existing = tables.get(table)?.get(column);
        if (!existing) throw new Error(`${name}: ALTER COLUMN on unknown ${table}.${column}`);
        existing.type = normaliseType(type);
        continue;
      }

      const droppedTable = flat.match(/^DROP TABLE(?: IF EXISTS)? "([^"]+)"/i);
      if (droppedTable) {
        tables.delete(droppedTable[1]);
        continue;
      }

      // Constraints and defaults do not change the shape this checks.
      if (/^ALTER TABLE "[^"]+" (ADD|DROP) CONSTRAINT/i.test(flat)) continue;
      if (/^ALTER TABLE "[^"]+" ALTER COLUMN "[^"]+" (SET|DROP) DEFAULT/i.test(flat)) continue;
      if (/^ALTER TABLE "[^"]+" RENAME/i.test(flat)) {
        throw new Error(`${name}: RENAME is not handled by this checker — teach it, or the check is lying`);
      }

      throw new Error(`${name}: unrecognised statement, so this check cannot vouch for it:\n  ${flat.slice(0, 160)}`);
    }
  }

  return tables;
}

/* ---------------------------------------------- reading schema.prisma --- */

/** Prisma scalars, and the Postgres type each lands as. */
const SCALARS: Record<string, string> = {
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'DOUBLE PRECISION',
  Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMP',
  Json: 'JSONB',
  BigInt: 'BIGINT',
  Bytes: 'BYTEA',
};

function parseSchema(): Tables {
  const text = readFileSync(SCHEMA, 'utf8');
  const modelNames = new Set([...text.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const tables: Tables = new Map();

  for (const block of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = block;
    const columns = new Map<string, Column>();

    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@') || line.startsWith('///')) continue;

      const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!field) continue;

      const [, name, type, list, optional, attributes] = field;

      // A field whose type is another model is a relation, not a column. The
      // foreign key it travels with is its own scalar field and is picked up
      // on its own line.
      if (modelNames.has(type)) continue;

      const scalar = SCALARS[type];
      if (!scalar) throw new Error(`${model}.${name}: unknown field type ${type}`);

      columns.set(name, {
        name,
        type: list ? `${scalar}[]` : scalar,
        // A field with a database-side default is still NOT NULL in Postgres;
        // only `?` makes a column nullable.
        nullable: Boolean(optional) && !attributes.includes('@id'),
      });
    }

    tables.set(model, columns);
  }

  return tables;
}

/* ------------------------------------------------------- comparison --- */

function main(): void {
  const fromMigrations = replayMigrations();
  const fromSchema = parseSchema();

  const problems: string[] = [];

  // The ledger is Prisma's own bookkeeping table and is in no model.
  fromMigrations.delete('_prisma_migrations');

  for (const table of fromMigrations.keys()) {
    if (!fromSchema.has(table)) {
      problems.push(`table "${table}" exists in the migrations but has no model in schema.prisma`);
    }
  }
  for (const table of fromSchema.keys()) {
    if (!fromMigrations.has(table)) {
      problems.push(`model ${table} is in schema.prisma but no migration creates that table`);
    }
  }

  for (const [table, actual] of fromMigrations) {
    const declared = fromSchema.get(table);
    if (!declared) continue;

    for (const [name, column] of actual) {
      const other = declared.get(name);
      if (!other) {
        problems.push(`"${table}"."${name}" is in the migrations but not in the ${table} model`);
        continue;
      }
      if (other.type !== column.type) {
        problems.push(
          `"${table}"."${name}" is ${column.type} in the migrations, ${other.type} in schema.prisma`
        );
      }
      // Nullability, except on lists. Prisma has no way to write a nullable
      // list — `String[]?` is not valid — so a list field always reads as NOT
      // NULL in the model whatever the column actually allows. VehicleMake
      // .wmiCodes is nullable in the database and cannot be described as such
      // here, so comparing the two would report a difference that no edit to
      // either file could resolve.
      //
      // It is safe to leave: nothing writes null into it, and the VIN lookup
      // reads it with `= ANY(...)`, which yields no match on a null array
      // rather than an error. Tightening the column would need a migration
      // against the live database, which is a bigger step than a comment
      // mismatch justifies.
      if (!column.type.endsWith('[]') && other.nullable !== column.nullable) {
        const say = (n: boolean) => (n ? 'nullable' : 'NOT NULL');
        problems.push(
          `"${table}"."${name}" is ${say(column.nullable)} in the migrations, ${say(other.nullable)} in schema.prisma`
        );
      }
    }

    for (const name of declared.keys()) {
      if (!actual.has(name)) {
        problems.push(`${table}.${name} is in schema.prisma but no migration adds that column`);
      }
    }
  }

  const columns = [...fromMigrations.values()].reduce((n, c) => n + c.size, 0);

  if (problems.length === 0) {
    console.log(
      `schema.prisma matches the migrations: ${fromMigrations.size} tables, ${columns} columns.`
    );
    return;
  }

  console.error(`schema.prisma has drifted from the migrations — ${problems.length} difference(s):\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nThe migrations are the source of truth: the database is built from them.' +
      '\nUpdate schema.prisma to match, or write the migration the model implies.'
  );
  process.exit(1);
}

main();
