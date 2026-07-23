import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, an unrelated
  // package-lock.json higher up the filesystem can be mis-detected as the root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
