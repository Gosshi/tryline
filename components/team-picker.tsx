"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FlagIcon } from "@/components/flag-icon";
import { trackFavoriteTeamAdded } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type TeamOption = {
  country: string | null;
  name: string;
  slug: string;
};

type TeamPickerProps = {
  initialSelected: string[];
  teams: TeamOption[];
};

export function TeamPicker({ initialSelected, teams }: TeamPickerProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function toggle(slug: string) {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
  }

  async function save() {
    setSaving(true);

    try {
      const response = await fetch("/api/user/profile", {
        body: JSON.stringify({ favorite_team_slugs: selected }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Failed to save favorite teams");
      }

      for (const slug of selected.filter(
        (slug) => !initialSelected.includes(slug),
      )) {
        trackFavoriteTeamAdded({ source: "team_picker", team_slug: slug });
      }

      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">応援チーム</p>
        <p className="text-[11px] text-slate-400">{selected.length}/3</p>
      </div>
      <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {teams.map((team) => {
          const isSelected = selected.includes(team.slug);
          const isDisabled = !isSelected && selected.length >= 3;

          return (
            <li key={team.slug}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-slate-700 hover:bg-slate-100",
                  isDisabled && "pointer-events-none opacity-40",
                )}
                disabled={isDisabled}
                onClick={() => toggle(team.slug)}
                type="button"
              >
                <FlagIcon size={16} slug={team.slug} />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {isSelected && (
                  <span className="text-xs font-bold" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        className="mt-3 w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        disabled={saving}
        onClick={() => void save()}
        type="button"
      >
        {saving ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
