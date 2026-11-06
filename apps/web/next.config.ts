import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end to end harness builds into its own folder so it never fights a dev server or a normal build over .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  transpilePackages: ["@houseful/contracts", "@houseful/pass"],
  async redirects() {
    return [{ source: "/", destination: "/mumbai", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
