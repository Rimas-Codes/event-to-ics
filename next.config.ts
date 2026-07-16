import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Don't bundle @prisma/client — it needs to load its native engine
  // binary at runtime from node_modules, not from the webpack bundle.
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],
  // Ensure Prisma's native engine binaries are included in the standalone
  // output (file tracing sometimes misses .node files).
  outputFileTracingIncludes: {
    '/': [
      './node_modules/@prisma/engines/**/*',
      './node_modules/@prisma/client/runtime/**/*',
      './node_modules/.prisma/client/**/*',
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
