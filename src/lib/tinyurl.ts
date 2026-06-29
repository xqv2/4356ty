/** Shorten a URL via TinyURL. Tries the keyless legacy endpoint first (works
 *  on every Vercel deployment with zero env config), then falls back to the
 *  authenticated v2 API if TINYURL_API_KEY is set, then falls back to the
 *  original long URL. Logs failures to Vercel runtime logs. */
export async function shortenUrl(longUrl: string): Promise<string> {
  // 1. Keyless legacy endpoint — no auth, free, no quota dashboard.
  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      { method: 'GET' },
    );
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.startsWith('http')) return text;
      console.warn(`shortenUrl: keyless endpoint returned non-URL body=${text.slice(0, 200)}`);
    } else {
      console.warn(`shortenUrl: keyless endpoint responded ${res.status}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`shortenUrl: keyless fetch threw; trying authed endpoint. msg=${msg}`);
  }

  // 2. Authenticated v2 API — only attempted if a key is configured.
  const apiKey = process.env.TINYURL_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch('https://api.tinyurl.com/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url: longUrl, domain: 'tinyurl.com' }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { tiny_url?: string } };
        const tiny = json.data?.tiny_url;
        if (tiny) return tiny;
        console.warn('shortenUrl: authed response missing tiny_url; falling back');
      } else {
        const detail = await res.text().catch(() => '');
        console.warn(`shortenUrl: authed endpoint ${res.status}; body=${detail.slice(0, 200)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`shortenUrl: authed fetch threw; falling back. msg=${msg}`);
    }
  }

  // 3. Both shorteners failed — return the original.
  return longUrl;
}
