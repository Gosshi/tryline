import { describe, expect, it } from "vitest";

import { IOS_APP_ID, getIosAppStoreUrl } from "@/lib/ios-app";

describe("iOS App Store URLs", () => {
  it("uses the approved app ID with distinct campaign tokens per CTA surface", () => {
    const hubUrl = getIosAppStoreUrl("hub");
    const calendarUrl = getIosAppStoreUrl("calendar");

    expect(IOS_APP_ID).toBe("6791587357");
    expect(hubUrl).toBe("https://apps.apple.com/jp/app/id6791587357?ct=hub");
    expect(calendarUrl).toBe(
      "https://apps.apple.com/jp/app/id6791587357?ct=calendar",
    );
    expect(hubUrl).not.toBe(calendarUrl);
  });
});
