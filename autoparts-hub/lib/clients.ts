import 'server-only';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

/**
 * Accounts: signing in, signing up, and what a session says about one.
 *
 * The password hash only ever leaves here for the one comparison that needs
 * it, which is why `byEmailForSignIn` is named for its purpose rather than
 * being a general "find a client".
 */

export interface SignInRow {
  id: string;
  name: string;
  email: string;
  role: string;
  categoryId: string | null;
  passwordHash: string | null;
}

export async function byEmailForSignIn(email: string): Promise<SignInRow | null> {
  return one<SignInRow>`
    SELECT "id", "name", "email", "role", "categoryId", "passwordHash"
    FROM "Client" WHERE "email" = ${email}
  `;
}

export async function emailTaken(email: string): Promise<boolean> {
  return (await one`SELECT 1 FROM "Client" WHERE "email" = ${email}`) !== null;
}

/** The tier a self-registered account starts on. Null if nobody set one up. */
export async function retailTierId(): Promise<string | null> {
  const row = await one<{ id: string }>`
    SELECT "id" FROM "ClientCategory" WHERE "name" = 'Retail' LIMIT 1
  `;
  return row?.id ?? null;
}

export interface NewClient {
  name: string;
  email: string;
  city: string | null;
  role: string;
  passwordHash: string;
  categoryId: string | null;
}

export async function createClient(input: NewClient): Promise<SignInRow> {
  const created = await one<SignInRow>`
    INSERT INTO "Client" ("id", "name", "email", "city", "role", "passwordHash", "categoryId")
    VALUES (${newId()}, ${input.name}, ${input.email}, ${input.city},
            ${input.role}, ${input.passwordHash}, ${input.categoryId})
    RETURNING "id", "name", "email", "role", "categoryId", "passwordHash"
  `;
  return created!;
}

/** The name of a pricing tier, for the session endpoint to report. */
export async function tierName(categoryId: string): Promise<string | null> {
  const row = await one<{ name: string }>`
    SELECT "name" FROM "ClientCategory" WHERE "id" = ${categoryId}
  `;
  return row?.name ?? null;
}
