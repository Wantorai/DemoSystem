import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  env: {
    STATIC_BASE_URL: process.env.STATIC_BASE_URL,
    NEXT_PUBLIC_LANGUAGE:
      process.env.LANGUAGE ?? process.env.NEXT_PUBLIC_LANGUAGE ?? "ru",
  },
};

export default nextConfig;
