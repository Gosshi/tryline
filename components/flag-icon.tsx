import { getTeamFlagSvg } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

type FlagIconProps = {
  slug: string;
  size?: number;
  className?: string;
};

export function FlagIcon({ slug, size = 20, className }: FlagIconProps) {
  const svg = getTeamFlagSvg(slug);

  if (!svg) {
    return <span aria-hidden>🏉</span>;
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 overflow-hidden rounded-[2px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{
        height: size,
        verticalAlign: "middle",
        width: Math.round(size * 1.5),
      }}
    />
  );
}
