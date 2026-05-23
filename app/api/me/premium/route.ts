import { NextResponse } from "next/server";

import { getUser, isPremium } from "@/lib/auth/server";

export async function GET() {
  const user = await getUser();

  if (!user) {
    return NextResponse.json({ isPremium: false });
  }

  const premium = await isPremium(user.id);

  return NextResponse.json({ isPremium: premium });
}
