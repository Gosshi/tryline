import { NextResponse } from "next/server";
import Stripe from "stripe";

import { requireUser } from "@/lib/auth/server";
import { SITE_URL } from "@/lib/site";

function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return new Stripe(apiKey);
}

export async function POST() {
  const user = await requireUser();
  const stripe = getStripe();
  const siteUrl = SITE_URL;
  const session = await stripe.checkout.sessions.create({
    cancel_url: `${siteUrl}/pricing`,
    customer_email: user.email ?? undefined,
    line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID!, quantity: 1 }],
    locale: "ja",
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id },
      trial_period_days: 7,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
    },
    mode: "subscription",
    payment_method_types: ["card"],
    success_url: `${siteUrl}/?checkout=success`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "checkout_url_missing" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(session.url, { status: 303 });
}