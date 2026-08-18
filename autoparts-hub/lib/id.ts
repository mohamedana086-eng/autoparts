import { randomBytes } from 'node:crypto';

/**
 * A new primary key.
 *
 * Prisma's `@default(cuid())` never reached the database — no column carries a
 * default, so the client minted the id and sent it. Removing the client means
 * minting it here instead, in the same shape, so a table does not end up with
 * two visibly different kinds of id in it.
 *
 * Collision-resistant rather than merely random: the timestamp prefix keeps
 * ids roughly ordered by creation, which is what makes an index on them behave
 * like the cuids already stored.
 */
export function newId(): string {
  const time = Date.now().toString(36);
  const random = randomBytes(8).toString('hex').slice(0, 12);
  return `c${time}${random}`;
}
