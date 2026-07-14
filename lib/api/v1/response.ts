import { NextResponse } from "next/server";

import type { ApiEnvelope } from "@/lib/api/v1/types";

export const PUBLIC_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=600";
export const PRIVATE_CACHE_CONTROL = "private, no-store";

export function apiSuccess<T>(
  data: T,
  cacheControl: string,
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    { data, error: null, success: true },
    { headers: { "Cache-Control": cacheControl } },
  );
}

export function apiError(
  error: string,
  status: number,
  cacheControl: string,
): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json(
    { data: null, error, success: false },
    { headers: { "Cache-Control": cacheControl }, status },
  );
}
