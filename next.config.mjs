/** @type {import('next').NextConfig} */
const supabaseHostname = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig = {
  reactStrictMode: true,
  // Server Actions cap request bodies at 1MB by default; bills include real
  // utility PDFs that routinely exceed that. 10MB covers every provider PDF
  // we've seen without inviting abuse.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
