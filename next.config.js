/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static export for web extension packaging
  output: 'export',
  assetPrefix: './',

  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Image optimization must be disabled for static exports
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
