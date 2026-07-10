import { NextResponse } from "next/server";

import { getUser, isPremium } from "@/lib/auth/server";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchContentEn } from "@/lib/db/queries/matches";
import { splitRecapForPaywall } from "@/lib/match-content/markdown";
import { isSampleMatch } from "@/lib/sample-matches";

type ResponseBody = {
  isPremium: boolean;
  lockedMd: string | null;
};

function json(body: ResponseBody) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();

  if (!user) {
    return json({ isPremium: false, lockedMd: null });
  }

  const premium = await isPremium(user.id);

  if (!premium) {
    return json({ isPremium: false, lockedMd: null });
  }

  if (await isSampleMatch(id)) {
    return json({ isPremium: true, lockedMd: null });
  }

  const url = new URL(request.url);
  const language = url.searchParams.get("lang") === "en" ? "en" : "ja";
  const content =
    language === "en"
      ? (await getMatchContentEn(id)).recap
      : (await getPublishedContentForMatch(id)).recap;

  if (!content) {
    return json({ isPremium: true, lockedMd: null });
  }

  const split = splitRecapForPaywall(content.contentMdJa);

  return json({
    isPremium: true,
    lockedMd: split.lockedMd,
  });
}
