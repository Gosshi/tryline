import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { handleMcpRequest, parseMcpRange } from "@/tools/analytics-mcp";

describe("analytics-mcp", () => {
  it("publishes only the three read-only analytics tools", async () => {
    const response = await handleMcpRequest(
      { id: 1, method: "tools/list" },
      {} as never,
    );
    expect(response).toMatchObject({
      result: {
        tools: [
          { name: "gsc_search_performance" },
          { name: "bing_search_performance" },
          { name: "bing_accessible_sites" },
        ],
      },
    });
    expect(JSON.stringify(response)).not.toContain(
      '"name":"gsc_url_inspection"',
    );
    expect(JSON.stringify(response)).not.toContain('"name":"bing_submit_url"');
  });

  it("uses the delayed GSC range and rejects unbounded ranges", () => {
    expect(parseMcpRange("90d", new Date("2026-09-15T12:00:00.000Z"))).toEqual({
      endDate: "2026-09-12",
      label: "90d",
      startDate: "2026-06-15",
    });
    expect(() => parseMcpRange("365d")).toThrow("range must be one of");
  });

  it("calls GSC with validated input and returns structured data", async () => {
    const gsc = vi.fn().mockResolvedValue({ rows: [{ clicks: 4 }] });
    const response = await handleMcpRequest(
      {
        id: "gsc",
        method: "tools/call",
        params: {
          name: "gsc_search_performance",
          arguments: { range: "7d", dimensions: ["page"], row_limit: 10 },
        },
      },
      { bing: vi.fn(), gsc },
    );
    expect(gsc).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: ["page"],
        rowLimit: 10,
        range: expect.objectContaining({ label: "7d" }),
      }),
    );
    expect(response).toMatchObject({
      result: { structuredContent: { rows: [{ clicks: 4 }] } },
    });
  });

  it("compacts Bing data and keeps credentials out of failures", async () => {
    const bing = vi.fn().mockResolvedValue({
      rankAndTrafficStats: [{ date: "2026-09-01", Clicks: 3, Impressions: 12 }],
      queryStats: [{ Query: "ラグビー", Clicks: 5, Impressions: 20 }],
      pageStats: [
        {
          Url: "https://www.trylinerugby.com/c/pnc",
          Clicks: 4,
          Impressions: 18,
        },
      ],
    });
    const response = await handleMcpRequest(
      {
        id: 2,
        method: "tools/call",
        params: { name: "bing_search_performance", arguments: {} },
      },
      { bing, gsc: vi.fn() },
    );
    expect(bing).toHaveBeenCalledWith(["traffic", "query", "page"]);
    expect(response).toMatchObject({
      result: {
        structuredContent: {
          topQueries: [{ value: "ラグビー", clicks: 5 }],
          topPages: [{ value: "https://www.trylinerugby.com/c/pnc" }],
        },
      },
    });

    const failure = await handleMcpRequest(
      {
        id: 3,
        method: "tools/call",
        params: { name: "bing_accessible_sites" },
      },
      {
        bing: vi.fn().mockRejectedValue(new Error("apikey=secret-value")),
        gsc: vi.fn(),
      },
    );
    expect(JSON.stringify(failure)).not.toContain("secret-value");
  });

  it("starts from a directory outside the repository", () => {
    const launcher = fileURLToPath(
      new URL("../../tools/run-analytics-mcp.cjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [launcher], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      input: `${JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      })}\n`,
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 1,
      result: { serverInfo: { name: "tryline-analytics" } },
    });
  });
});
