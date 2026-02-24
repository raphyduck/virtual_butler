/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use standalone output for production builds (docker build --target production).
  // Setting output:'standalone' in dev mode breaks route discovery — all pages 404 because
  // Next.js looks for a pre-built standalone bundle that doesn't exist during `next dev`.
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
