import {
  getTeamFlag,
  getTeamFlagSvg,
  getTeamStripeColors,
} from "@/lib/format/team-identity";

type TeamBadgeProps = {
  shortCode: string;
  size?: number;
  slug: string;
};

export function TeamBadge({ shortCode, size = 32, slug }: TeamBadgeProps) {
  const flagSvg = getTeamFlagSvg(slug);

  if (flagSvg) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 overflow-hidden rounded-[2px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: flagSvg }}
        style={{
          height: size,
          verticalAlign: "middle",
          width: size,
        }}
      />
    );
  }

  const flag = getTeamFlag(slug);

  if (flag !== "🏉") {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center leading-none"
        style={{
          fontSize: Math.round(size * 0.72),
          height: size,
          verticalAlign: "middle",
          width: size,
        }}
      >
        {flag}
      </span>
    );
  }

  const colors = getTeamStripeColors(slug);
  const primaryColor = colors[0] ?? "#94a3b8";
  const gradientId = `badge-${slug}`;

  return (
    <svg
      aria-label={shortCode}
      height={size}
      role="img"
      style={{ flexShrink: 0 }}
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          {colors.flatMap((color, index) => {
            const start = Math.round((index / colors.length) * 100);
            const end = Math.round(((index + 1) / colors.length) * 100);

            return [
              <stop key={`${color}-${index}-start`} offset={`${start}%`} stopColor={color} />,
              <stop key={`${color}-${index}-end`} offset={`${end}%`} stopColor={color} />,
            ];
          })}
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" fill={`url(#${gradientId})`} r="15" />
      <text
        dominantBaseline="central"
        fill={isLightColor(primaryColor) ? "#111111" : "#FFFFFF"}
        fontFamily="system-ui, sans-serif"
        fontSize={shortCode.length <= 2 ? "11" : "9"}
        fontWeight="bold"
        letterSpacing="0"
        textAnchor="middle"
        x="16"
        y="16"
      >
        {shortCode}
      </text>
    </svg>
  );
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
