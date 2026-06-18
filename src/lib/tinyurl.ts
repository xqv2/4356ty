/** Shorten a URL via TinyURL API. Falls back to the original URL on any error. */
export async function shortenUrl(longUrl: string): Promise<string> {
  const apiKey = process.env.TINYURL_API_KEY;
  if (!apiKey) return longUrl;

  try {
    const res = await fetch('https://api.tinyurl.com/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url: longUrl, domain: 'tinyurl.com' }),
    });
    if (!res.ok) return longUrl;
    const json = (await res.json()) as { data?: { tiny_url?: string } };
    return json.data?.tiny_url ?? longUrl;
  } catch {
    return longUrl;
  }
}
