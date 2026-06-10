import { NextResponse } from "next/server";

import {
  getSupabaseServerClientWithAuth,
  getUser,
  isPremium,
} from "@/lib/auth/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const user = await getUser();

  if (!user) {
    return NextResponse.json({
      hasFreeQuestion: false,
      isLoggedIn: false,
    });
  }

  const premium = await isPremium(user.id);

  if (premium) {
    return NextResponse.json({
      hasFreeQuestion: true,
      isLoggedIn: true,
    });
  }

  const supabase = await getSupabaseServerClientWithAuth();
  const { data } = await supabase
    .from("chat_free_questions")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .maybeSingle();

  return NextResponse.json({
    hasFreeQuestion: !data,
    isLoggedIn: true,
  });
}
