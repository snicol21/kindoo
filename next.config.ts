import withPWA from '@ducanh2912/next-pwa';
import type { NextConfig } from 'next';
import path from 'path';

const withPWAConfig = withPWA({
  dest: 'public',
  register: true,
  disable: true,
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  extendDefaultRuntimeCaching: false,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^\/api\/license-jobs\/stream$/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /^\/api\/.*$/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /^\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static-assets',
          expiration: {
            maxEntries: 256,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
      {
        urlPattern: /\.(?:js|css|woff2?|png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: {
            maxEntries: 256,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  cacheComponents: false,
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withPWAConfig(nextConfig);
