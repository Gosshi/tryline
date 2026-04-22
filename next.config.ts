import { getServerEnv } from "./lib/env";

import type { NextConfig } from "next";

getServerEnv(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
