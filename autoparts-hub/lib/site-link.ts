/**
 * Whether a string is a path on this site.
 *
 * Its own module, with no `server-only`, because two unrelated places need
 * the same answer — the picture list on a part and the link on a notification
 * — and each had reached for `startsWith('/')`, which is not the question.
 *
 * `/…` is a path. `//…` is not: the first character says path and every
 * browser reads it as an absolute url on another host, which is how a check
 * meant to keep a link on this site hands out an off-site one. The backslash
 * form is the same trap wearing a different hat — the URL standard treats `\`
 * as `/` in the authority position, so `/\evil.example` resolves off-site too.
 */
export function isSitePath(value: string): boolean {
  if (!value.startsWith('/')) return false;

  // A lone "/" is the site root, which is a path like any other.
  const second = value[1];
  return second !== '/' && second !== '\\';
}
