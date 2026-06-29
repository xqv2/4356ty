/** No-op shortener. The production share URL (https://274bills.vercel.app/
 *  share/<token>) is already short enough that TinyURL's preview interstitial
 *  and quota dashboard add more hassle than value. Kept as a function so we
 *  can plug a different shortener in later without touching callers. */
export async function shortenUrl(longUrl: string): Promise<string> {
  return longUrl;
}
