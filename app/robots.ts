import { SITE_URL } from "@/lib/site";

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      disallow: [
        "/ops",
        "/api/me/",
        "/api/matches/",
        "/api/home/",
        "/api/user/",
        "/api/chat/",
      ],
      userAgent: "*",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
