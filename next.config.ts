import { getServerEnv } from "./lib/env";

import type { NextConfig } from "next";

getServerEnv(process.env);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "images.unsplash.com", protocol: "https" },
      { hostname: "i.ytimg.com", protocol: "https" },
    ],
  },
  reactStrictMode: true,
  async redirects() {
    return [
      {
        destination: "/c/rwc/:season",
        permanent: true,
        source: "/c/rwc/rwc-:season",
      },
      {
        destination: "/c/premiership/:slug",
        permanent: true,
        source: "/c/premiership/premiership-:slug",
      },
      {
        destination: "/c/urc/:slug",
        permanent: true,
        source: "/c/urc/urc-:slug",
      },
      {
        destination: "/c/top-14/:slug",
        permanent: true,
        source: "/c/top-14/top-14-:slug",
      },
      {
        destination: "/c/six-nations/:slug",
        permanent: true,
        source: "/c/six-nations/six-nations-:slug",
      },
      {
        destination: "/c/rugby-championship/:slug",
        permanent: true,
        source: "/c/rugby-championship/rugby-championship-:slug",
      },
      {
        destination: "/c/super-rugby-pacific/:slug",
        permanent: true,
        source: "/c/super-rugby-pacific/super-rugby-pacific-:slug",
      },
      {
        destination: "/c/league-one/:slug",
        permanent: true,
        source: "/c/league-one/league-one-:slug",
      },
      {
        destination: "/c/autumn-nations/:slug",
        permanent: true,
        source: "/c/autumn-nations/autumn-nations-:slug",
      },
      {
        destination: "/c/nations-cup/:slug",
        permanent: true,
        source: "/c/nations-cup/nations-cup-:slug",
      },
    ];
  },
};

export default nextConfig;
