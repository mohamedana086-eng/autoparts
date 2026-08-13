import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

/**
 * Session tokens.
 *
 * There is no auth library here: a session is a JSON payload and an HMAC of
 * it, and `decodeSession` is the only thing standing between a cookie and
 * being whoever it claims. Every test below is a forgery attempt that has to
 * fail, plus the one shape that has to succeed.
 *
 * The secret is set before the module loads because lib/auth.ts reads it once
 * at import — which is also why a deployment that forgets AUTH_SECRET keeps
 * signing with the placeholder rather than failing loudly.
 */
const SECRET = 'test-secret-not-the-placeholder';
process.env.AUTH_SECRET = SECRET;

const { decodeSession, toRole, resolveAuthSecret } = await import('@/lib/auth');

const PLACEHOLDER = 'dev-only-insecure-secret-change-me';

const sign = (data: string) =>
  crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

/** Builds a token the same way the app does, so the wire format is asserted
 *  independently rather than by round-tripping the encoder against itself. */
function token(payload: Record<string, unknown>, tamperSignature = false): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${tamperSignature ? sign(body + 'x') : sign(body)}`;
}

const valid = {
  userId: 'client-1',
  role: 'ADMIN',
  categoryId: 'cat-1',
  name: 'Mohamed',
  exp: Date.now() + 60_000,
};

describe('decodeSession', () => {
  it('accepts a properly signed, unexpired token', () => {
    const session = decodeSession(token(valid));

    expect(session).not.toBeNull();
    expect(session?.userId).toBe('client-1');
    expect(session?.role).toBe('ADMIN');
  });

  it('rejects a payload edited after signing', () => {
    // The forgery that matters: take a real RETAIL cookie, rewrite the role.
    const real = token({ ...valid, role: 'RETAIL' });
    const [, signature] = real.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...valid, role: 'ADMIN' })).toString(
      'base64url'
    );

    expect(decodeSession(`${forgedBody}.${signature}`)).toBeNull();
  });

  it('rejects a signature that was not produced from this payload', () => {
    expect(decodeSession(token(valid, true))).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const body = Buffer.from(JSON.stringify(valid)).toString('base64url');
    const wrong = crypto.createHmac('sha256', 'some-other-secret').update(body).digest('base64url');

    expect(decodeSession(`${body}.${wrong}`)).toBeNull();
  });

  it('rejects an expired token even though the signature is good', () => {
    expect(decodeSession(token({ ...valid, exp: Date.now() - 1 }))).toBeNull();
  });

  it('rejects an unsigned payload', () => {
    const body = Buffer.from(JSON.stringify(valid)).toString('base64url');

    expect(decodeSession(body)).toBeNull();
    expect(decodeSession(`${body}.`)).toBeNull();
  });

  it('rejects nothing at all rather than throwing', () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession(null)).toBeNull();
    expect(decodeSession('')).toBeNull();
  });

  it('rejects a correctly signed body that is not JSON', () => {
    // Signed, so it gets past the HMAC and has to be caught by the parse.
    const body = Buffer.from('not json at all').toString('base64url');

    expect(decodeSession(`${body}.${sign(body)}`)).toBeNull();
  });
});

describe('resolveAuthSecret', () => {
  const good = 'a'.repeat(64);

  it('takes what is configured in production', () => {
    expect(resolveAuthSecret(good, 'production')).toBe(good);
  });

  it('refuses to sign with nothing in production', () => {
    // Silently falling back is how a deployment ends up forgeable without
    // anyone doing something visibly wrong.
    expect(() => resolveAuthSecret(undefined, 'production')).toThrow(/not set/);
    expect(() => resolveAuthSecret('', 'production')).toThrow(/not set/);
  });

  it('refuses the placeholder in production', () => {
    // The likeliest mistake by far: .env.example ships this value and the
    // README's first step is to copy that file.
    expect(() => resolveAuthSecret(PLACEHOLDER, 'production')).toThrow(/\.env\.example/);
  });

  it('refuses a secret too short to be worth having', () => {
    expect(() => resolveAuthSecret('short', 'production')).toThrow(/5 characters/);
    expect(() => resolveAuthSecret('a'.repeat(31), 'production')).toThrow(/31 characters/);
    expect(resolveAuthSecret('a'.repeat(32), 'production')).toBe('a'.repeat(32));
  });

  it('says how to generate one, whichever way it refused', () => {
    for (const bad of [undefined, PLACEHOLDER, 'short']) {
      expect(() => resolveAuthSecret(bad, 'production')).toThrow(/openssl rand -hex 32/);
    }
  });

  it('leaves development alone', () => {
    // A local app that will not start until you invent a secret is a worse
    // first five minutes for no gain — nothing local is exposed.
    expect(resolveAuthSecret(undefined, 'development')).toBe(PLACEHOLDER);
    expect(resolveAuthSecret(PLACEHOLDER, 'development')).toBe(PLACEHOLDER);
    expect(resolveAuthSecret('short', 'development')).toBe('short');
    expect(resolveAuthSecret(undefined, undefined)).toBe(PLACEHOLDER);
    expect(resolveAuthSecret(undefined, 'test')).toBe(PLACEHOLDER);
  });
});

describe('toRole', () => {
  it('passes through the roles the app knows', () => {
    expect(toRole('ADMIN')).toBe('ADMIN');
    expect(toRole('SALES')).toBe('SALES');
    expect(toRole('B2B')).toBe('B2B');
    expect(toRole('RETAIL')).toBe('RETAIL');
  });

  it('falls back to the least privileged role for anything else', () => {
    // The column is free text, so an unrecognised value has to fail closed —
    // reading it as "unknown, therefore allow" is how a typo becomes a login.
    expect(toRole('admin')).toBe('RETAIL');
    expect(toRole('SUPERUSER')).toBe('RETAIL');
    expect(toRole('')).toBe('RETAIL');
    expect(toRole(null)).toBe('RETAIL');
    expect(toRole(undefined)).toBe('RETAIL');
  });
});
