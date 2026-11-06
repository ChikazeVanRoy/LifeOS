import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

// Which code this build was made from, shown in the app. Not being in a Git checkout is fine.
const git = (...args: string[]) => {
  try {
    return execFileSync("git", args, { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};
const commit = git("log", "-1", "--format=%h·%cs").split("·");
const version = `${process.env.npm_package_version ?? "0.1.0"}${commit[0] ? ` (${commit[0]}, ${commit[1]})` : ""}`;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
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
