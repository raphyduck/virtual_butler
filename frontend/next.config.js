/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // BACKEND_INTERNAL_URL is a server-only variable pointing to the backend
        // on the Docker-internal network (e.g. http://backend:8000). Fall back to
        // NEXT_PUBLIC_API_URL for local dev without Docker, then localhost.
        destination: `${backendUrl}/api/:path*`,
      },
      {
        // Proxy WebSocket endpoints through the same origin so the browser
        // doesn't need direct access to the backend port.
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
