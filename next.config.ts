import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server, used by the Docker image.
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/verify/text": ["./data/demo/verify-text-*.json"],
    "/api/sources/suggest": ["./data/demo/sources-suggest-*.json"],
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

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
