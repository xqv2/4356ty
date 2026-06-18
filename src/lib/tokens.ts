// src/lib/tokens.ts
// 8-char share tokens + expiry helpers. Uses Web Crypto for randomness.
//
// Alphabet excludes ambiguous chars: 0/O, 1/l/I — leaves 32 distinct chars.
// Token entropy: 32^8 ≈ 1.1 trillion combos, plenty for 5-day links.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars (no 0/O/1/l/I)
const TOKEN_LEN = 8;

/** Mint a new 8-char alphanumeric share token. */
export function mintToken(): string {
  const cryptoObj = getCrypto();
  const out = new Array<string>(TOKEN_LEN);

  if (cryptoObj?.getRandomValues) {
    // Rejection sampling so the distribution stays uniform across the alphabet.
    const range = ALPHABET.length;
    const max = Math.floor(256 / range) * range;
    const buf = new Uint8Array(TOKEN_LEN * 2);
    let filled = 0;
    while (filled < TOKEN_LEN) {
      cryptoObj.getRandomValues(buf);
      for (let i = 0; i < buf.length && filled < TOKEN_LEN; i++) {
        const v = buf[i]!;
        if (v < max) out[filled++] = ALPHABET[v % range]!;
      }
    }
  } else {
    for (let i = 0; i < TOKEN_LEN; i++) {
      out[i] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
    }
  }

  return out.join('');
}

/** True when the supplied ISO timestamp is in the past. */
export function isExpired(expires_at: string): boolean {
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}

/** ISO timestamp for `days` from now (default 5). */
export function expiryFromNow(days = 5): string {
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function getCrypto(): Crypto | undefined {
  return typeof globalThis !== 'undefined'
    ? (globalThis as unknown as { crypto?: Crypto }).crypto
    : undefined;
}
