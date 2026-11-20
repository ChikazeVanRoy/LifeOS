import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
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

// The public addresses and keys of Library (Supabase) and Anki Analytics (Firebase), taken from
// those projects' own files next to this one, so connecting only asks for an email and password.
// These are the same values those sites ship to every browser; nothing secret is read here.
const sibling = (file: string) => {
  try {
    return readFileSync(path.resolve(__dirname, "..", file), "utf8");
  } catch {
    return "";
  }
};
const envFile = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*["']?(.*?)["']?\s*$/gm)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
const libraryEnv = envFile(sibling("Library/app/.env.local"));
const ankiCloud = (() => {
  try {
    return JSON.parse(sibling("anki-analytics/data/cloud.json")) as { projectId?: string; apiKey?: string };
  } catch {
    return {};
  }
})();
const links = {
  NEXT_PUBLIC_LIBRARY_URL: process.env.LIBRARY_SUPABASE_URL ?? libraryEnv.VITE_SUPABASE_URL ?? "",
  NEXT_PUBLIC_LIBRARY_KEY: process.env.LIBRARY_SUPABASE_ANON_KEY ?? libraryEnv.VITE_SUPABASE_ANON_KEY ?? "",
  NEXT_PUBLIC_ANKI_PROJECT: process.env.ANKI_FIREBASE_PROJECT_ID ?? ankiCloud.projectId ?? "",
  NEXT_PUBLIC_ANKI_KEY: process.env.ANKI_FIREBASE_API_KEY ?? ankiCloud.apiKey ?? "",
};

// `npm run build:static` makes the plain site that is hosted on Firebase. It has no server, so no API routes.
const isStatic = process.env.LIFEOS_STATIC === "1";

const nextConfig: NextConfig = {
  ...(isStatic ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
  env: { NEXT_PUBLIC_APP_VERSION: version, NEXT_PUBLIC_STATIC: isStatic ? "1" : "", ...links },
  devIndicators: false,
  // Inside node_modules, which iCloud Drive is told to skip and file watchers ignore.
  distDir: isStatic ? "out" : "node_modules/.cache/next",
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
