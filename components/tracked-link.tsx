"use client";

import Link from "next/link";

import { trackCtaClick, type CtaClickParams } from "@/lib/analytics";

import type { ComponentProps, MouseEvent } from "react";

type TrackedLinkProps = ComponentProps<typeof Link> & {
  analytics: CtaClickParams;
};

export function TrackedLink({
  analytics,
  onClick,
  ...props
}: TrackedLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    trackCtaClick(analytics);
    onClick?.(event);
  }

  return <Link {...props} onClick={handleClick} />;
}
