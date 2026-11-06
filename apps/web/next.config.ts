import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
