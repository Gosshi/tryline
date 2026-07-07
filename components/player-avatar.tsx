import { getPositionGroup } from "@/lib/utils/rugby-positions";

const GROUP_COLOR: Record<ReturnType<typeof getPositionGroup>, string> = {
  bk: "var(--color-accent)",
  fw: "var(--color-ink)",
  unknown: "var(--color-ink-muted)",
};

type PlayerAvatarProps = {
  position: string | null;
  size?: number;
};

export function PlayerAvatar({ position, size = 40 }: PlayerAvatarProps) {
  const group = getPositionGroup(position);
  const color = GROUP_COLOR[group];

  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      focusable="false"
      height={size}
      viewBox="0 0 40 40"
      width={size}
    >
      <circle cx="20" cy="20" fill={color} r="20" />
      <circle cx="20" cy="15" fill="#ffffff" fillOpacity="0.92" r="5.8" />
      <path
        d="M9 33.5c.9-7.6 5.7-12 11-12s10.1 4.4 11 12H9Z"
        fill="#ffffff"
        fillOpacity="0.92"
      />
    </svg>
  );
}
