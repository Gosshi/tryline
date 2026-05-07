import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const home = truncate(searchParams.get("home") ?? "Home", 22);
  const away = truncate(searchParams.get("away") ?? "Away", 22);
  const score = searchParams.get("score") ?? "";
  const competition = truncate(searchParams.get("competition") ?? "Rugby", 42);
  const status = searchParams.get("status") ?? "upcoming";

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f172a",
          color: "white",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          height: "630px",
          justifyContent: "space-between",
          padding: "64px",
          width: "1200px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: "12px" }}>
          <div
            style={{
              background: "#22c55e",
              borderRadius: "50%",
              height: "12px",
              width: "12px",
            }}
          />
          <span style={{ color: "#94a3b8", fontSize: "20px", fontWeight: 700 }}>
            Tryline
          </span>
          <span style={{ color: "#475569", fontSize: "18px" }}>—</span>
          <span style={{ color: "#94a3b8", fontSize: "18px" }}>
            {competition}
          </span>
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: "56px",
              fontWeight: 900,
              gap: "32px",
            }}
          >
            <span>{home}</span>
            {score ? (
              <span
                style={{
                  color: "#22c55e",
                  fontSize: "48px",
                  fontWeight: 700,
                  minWidth: "160px",
                  textAlign: "center",
                }}
              >
                {score}
              </span>
            ) : (
              <span style={{ color: "#475569", fontSize: "36px" }}>vs</span>
            )}
            <span>{away}</span>
          </div>

          {status === "live" && (
            <div
              style={{
                background: "#dc2626",
                borderRadius: "9999px",
                color: "white",
                fontSize: "16px",
                fontWeight: 700,
                padding: "6px 16px",
              }}
            >
              LIVE
            </div>
          )}
        </div>

        <div style={{ color: "#475569", fontSize: "16px" }}>
          tryline-six.vercel.app
        </div>
      </div>
    ),
    { height: 630, width: 1200 },
  );
}
