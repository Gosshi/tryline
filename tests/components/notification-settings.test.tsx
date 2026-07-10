// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationSettings } from "@/components/notification-settings";

function mockPushApis() {
  const subscribe = vi.fn().mockResolvedValue({
    endpoint: "https://push.example/subscription",
    getKey: () => new Uint8Array([1, 2, 3]).buffer,
  });

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe,
        },
      }),
      register: vi.fn().mockResolvedValue(undefined),
    },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: {
      query: vi.fn().mockResolvedValue({ state: "default" }),
    },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });

  return { subscribe };
}

describe("NotificationSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends spoiler_guard when subscribing with spoiler guard enabled", async () => {
    mockPushApis();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationSettings initialTeamSlugs={["japan"]} />);

    fireEvent.click(screen.getByRole("button", { name: "ネタバレ防止モード" }));
    fireEvent.click(screen.getByRole("button", { name: "recap 通知をオン" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; method: string },
    ];
    expect(JSON.parse(init.body)).toMatchObject({
      endpoint: "https://push.example/subscription",
      spoiler_guard: true,
      team_slugs: ["japan"],
    });
    expect(init.method).toBe("POST");
  });
});
