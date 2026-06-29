/** Shorten a URL via TinyURL. Tries the authenticated v2 API first (clean
 *  links, no interstitial), falls back to the keyless legacy endpoint (which
 *  TinyURL now wraps in a deprecation-warning preview page) only if the API
 *  call fails. Finally returns the original URL if both shorteners are down. */
export async function shortenUrl(longUrl: string): Promise<string> {
  // 1. Authenticated v2 API — clean tinyurl.com/<slug> with no interstitial.
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
        console.warn('shortenUrl: authed response missing tiny_url; falling back to keyless');
      } else {
        const detail = await res.text().catch(() => '');
        console.warn(`shortenUrl: authed endpoint ${res.status}; body=${detail.slice(0, 200)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`shortenUrl: authed fetch threw; trying keyless. msg=${msg}`);
    }
  } else {
    console.warn('shortenUrl: TINYURL_API_KEY not set; using keyless endpoint (will show preview page)');
  }

  // 2. Keyless legacy endpoint — works without a key but shows a deprecation
  //    interstitial; only used as a fallback so the message still has *some*
  //    short link instead of the long origin URL.
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
    console.warn(`shortenUrl: keyless fetch threw; falling back to long URL. msg=${msg}`);
  }

  // 3. Both shorteners failed — return the original.
  return longUrl;
}
