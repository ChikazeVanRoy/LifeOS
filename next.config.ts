import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Inside node_modules, which iCloud Drive is told to skip and file watchers ignore.
  distDir: "node_modules/.cache/next",
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
