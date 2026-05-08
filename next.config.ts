import { getServerEnv } from "./lib/env";

import type { NextConfig } from "next";

getServerEnv(process.env);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "images.unsplash.com", protocol: "https" },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
