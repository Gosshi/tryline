import { describe, expect, it } from "vitest";

import { metadata as privacyMetadata } from "@/app/legal/privacy/page";
import { metadata as termsMetadata } from "@/app/legal/terms/page";
import { metadata as tokushoMetadata } from "@/app/legal/tokusho/page";

describe("legal page metadata", () => {
  it("uses raw page titles so the root template appends Tryline only once", () => {
    expect(privacyMetadata.title).toBe("プライバシーポリシー");
    expect(termsMetadata.title).toBe("利用規約");
    expect(tokushoMetadata.title).toBe("特定商取引法に基づく表示");
  });
});
