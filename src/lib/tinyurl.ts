/** Shorten a URL via TinyURL API. Falls back to the original URL on any error.
 *  Logs the failure to the server console so a missing/invalid API key or
 *  network error is visible in Vercel runtime logs instead of silently
 *  pasting a giant URL into the share message. */
export async function shortenUrl(longUrl: string): Promise<string> {
  const apiKey = process.env.TINYURL_API_KEY;
  if (!apiKey) {
    console.warn('shortenUrl: TINYURL_API_KEY not set; returning long URL');
    return longUrl;
  }

  try {
    const res = await fetch('https://api.tinyurl.com/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url: longUrl, domain: 'tinyurl.com' }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`shortenUrl: TinyURL responded ${res.status}; falling back. body=${detail.slice(0, 300)}`);
      return longUrl;
    }
    const json = (await res.json()) as { data?: { tiny_url?: string } };
    const tiny = json.data?.tiny_url;
    if (!tiny) {
      console.warn('shortenUrl: TinyURL response missing tiny_url; falling back');
      return longUrl;
    }
    return tiny;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`shortenUrl: fetch threw; falling back. msg=${msg}`);
    return longUrl;
  }
}
