import { readFileSync } from "node:fs";
import { beforeEach } from "vitest";

import { resetAnalyticsQueueForTests } from "@/lib/analytics";

beforeEach(() => {
  resetAnalyticsQueueForTests();
});

// jsdom does not load the app stylesheet. Exercise the actual shared guard CSS,
// so a regression cannot pass merely because the scores stayed in the DOM.
beforeEach(() => {
  if (typeof document === "undefined") return;
  localStorage.clear();
  document.documentElement.dataset.spoilerGuard = "off";
  if (!document.getElementById("test-spoiler-css")) {
    const style = document.createElement("style");
    style.id = "test-spoiler-css";
    style.textContent = readFileSync(`${process.cwd()}/app/globals.css`, "utf8").split("/* Spoiler guard:")[1]?.split("/* End spoiler guard */")[0]?.replace(/^[^*]*\*\//, "") ?? "";
    document.head.append(style);
  }
});
