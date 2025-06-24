import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Enable static export for web extension packaging
  output: 'export',
  trailingSlash: true,
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

export default nextConfig;
