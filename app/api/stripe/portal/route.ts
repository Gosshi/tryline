import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getUserProfile, requireUser } from "@/lib/auth/server";

function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return new Stripe(apiKey);
}

async function createPortalResponse() {
  const user = await requireUser();
  const profile = await getUserProfile(user.id);
  const stripe = getStripe();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://tryline-six.vercel.app",
  });

  return NextResponse.redirect(session.url, { status: 303 });
}

export async function GET() {
  return createPortalResponse();
}

export async function POST() {
  return createPortalResponse();
}
