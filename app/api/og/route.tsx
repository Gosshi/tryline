import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const interFont = await fetch(
    "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2",
  ).then((res) => res.arrayBuffer());
  const fontSignature = new TextDecoder("ascii").decode(
    new Uint8Array(interFont).slice(0, 4),
  );
  const fontData =
    fontSignature === "wOF2"
      ? await fetch(new URL("/og-font.ttf", request.url)).then((res) =>
          res.arrayBuffer(),
        )
      : interFont;
  const fontName = fontSignature === "wOF2" ? "Geist" : "Inter";
  let bgDataUri: string | null = null;

  try {
    const bgResponse = await fetch(new URL("/og-bg.png", request.url));

    if (!bgResponse.ok) {
      throw new Error("OG background image is unavailable.");
    }

    const bgBuffer = await bgResponse.arrayBuffer();
    bgDataUri = `data:image/png;base64,${Buffer.from(bgBuffer).toString(
      "base64",
    )}`;
  } catch {
    bgDataUri = null;
  }

  const home = truncate(searchParams.get("home") ?? "Home", 20);
  const away = truncate(searchParams.get("away") ?? "Away", 20);
  const score = searchParams.get("score") ?? "";
  const competition = truncate(searchParams.get("competition") ?? "Rugby", 42);
  const status = searchParams.get("status") ?? "upcoming";

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(180deg, #0B1628 0%, #0f172a 100%)",
          color: "white",
          display: "flex",
          fontFamily: "Inter, Geist, sans-serif",
          height: "630px",
          overflow: "hidden",
          padding: "56px 64px 48px 70px",
          position: "relative",
          width: "1200px",
        }}
      >
        {bgDataUri && (
          // eslint-disable-next-line @next/next/no-img-element -- @vercel/og renders plain img elements in ImageResponse.
          <img
            alt=""
            src={bgDataUri}
            style={{
              display: "flex",
              height: "100%",
              inset: 0,
              objectFit: "cover",
              position: "absolute",
              width: "100%",
            }}
          />
        )}
        <div
          style={{
            background: "rgba(11, 22, 40, 0.72)",
            display: "flex",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            background: "#22c55e",
            bottom: 0,
            display: "flex",
            left: 0,
            position: "absolute",
            top: 0,
            width: "6px",
            zIndex: 2,
          }}
        />

        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            left: 70,
            position: "absolute",
            right: 64,
            top: 54,
            zIndex: 2,
          }}
        >
          <div
            style={{
              background: "rgba(148, 163, 184, 0.14)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: "9999px",
              color: "#cbd5e1",
              display: "flex",
              fontSize: "22px",
              fontWeight: 700,
              padding: "10px 18px",
            }}
          >
            {competition}
          </div>
          <div style={{ color: "#e2e8f0", fontSize: "24px", fontWeight: 700 }}>
            Tryline
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: "30px",
            height: "100%",
            justifyContent: "center",
            position: "relative",
            width: "100%",
            zIndex: 2,
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: "64px",
              fontWeight: 700,
              gap: "36px",
              justifyContent: "center",
              lineHeight: 1.05,
              maxWidth: "1060px",
            }}
          >
            <span
              style={{
                display: "flex",
                justifyContent: "flex-end",
                minWidth: "360px",
                textAlign: "right",
              }}
            >
              {home}
            </span>
            {score ? (
              <span
                style={{
                  color: "#22c55e",
                  display: "flex",
                  fontSize: "58px",
                  fontWeight: 700,
                  justifyContent: "center",
                  minWidth: "190px",
                  textAlign: "center",
                }}
              >
                {score}
              </span>
            ) : (
              <span
                style={{
                  color: "#64748b",
                  display: "flex",
                  fontSize: "40px",
                  justifyContent: "center",
                  minWidth: "120px",
                }}
              >
                vs
              </span>
            )}
            <span
              style={{
                display: "flex",
                justifyContent: "flex-start",
                minWidth: "360px",
              }}
            >
              {away}
            </span>
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

        <div
          style={{
            bottom: 44,
            color: "#64748b",
            display: "flex",
            fontSize: "20px",
            fontWeight: 700,
            position: "absolute",
            right: 64,
            zIndex: 2,
          }}
        >
          trylinerugby.com
        </div>
      </div>
    ),
    {
      fonts: [
        {
          data: fontData,
          name: fontName,
          style: "normal",
          weight: 700,
        },
      ],
      height: 630,
      width: 1200,
    },
  );
}
