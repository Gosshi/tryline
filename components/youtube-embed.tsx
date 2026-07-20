"use client";

import Image from "next/image";
import { useState } from "react";

import { YOUTUBE_ALLOWED_CHANNEL_IDS } from "@/lib/youtube/allowed-channels";

type YouTubeEmbedProps = {
  channelId: string;
  /** Set false when a verified video cannot be embedded in the viewer's region. */
  canEmbed?: boolean;
  title?: string;
  videoId: string;
};

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function getWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function YouTubeEmbed({
  canEmbed = true,
  channelId,
  title = "YouTube動画",
  videoId,
}: YouTubeEmbedProps) {
  const [shouldLoadPlayer, setShouldLoadPlayer] = useState(false);
  const isAllowed =
    canEmbed &&
    YOUTUBE_VIDEO_ID.test(videoId) &&
    YOUTUBE_ALLOWED_CHANNEL_IDS.includes(channelId);
  const watchUrl = getWatchUrl(videoId);

  if (!isAllowed) {
    return (
      <a
        className="font-medium text-[var(--color-accent)] underline underline-offset-4"
        href={watchUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {title}をYouTubeで見る
      </a>
    );
  }

  if (!shouldLoadPlayer) {
    return (
      <button
        aria-label={`${title}を再生`}
        className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        onClick={() => setShouldLoadPlayer(true)}
        type="button"
      >
        <Image
          alt=""
          fill
          className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
          sizes="(max-width: 768px) 100vw, 768px"
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/70 px-5 py-2.5 text-sm font-semibold text-white">
            YouTubeで再生
          </span>
        </span>
      </button>
    );
  }

  return (
    <iframe
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      className="aspect-video w-full rounded-xl border-0"
      referrerPolicy="strict-origin-when-cross-origin"
      src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
      title={title}
    />
  );
}
