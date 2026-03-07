import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.modules = [
      ...(config.resolve.modules ?? []),
      path.resolve(process.cwd(), "node_modules"),
    ];
    return config;
  },
};

export default nextConfig;
