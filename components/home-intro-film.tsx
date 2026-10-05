"use client";

import { useEffect, useRef, useState } from "react";

const POSTER_SRC = "/videos/tryline-promo-poster.jpg";
const VIDEO_SRC = "/videos/tryline-promo-720p.mp4";

export function HomeIntroFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const desktop = window.matchMedia("(min-width: 701px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setEnabled(
        document.readyState === "complete" &&
          desktop.matches &&
          !reducedMotion.matches,
      );
    };

    update();
    window.addEventListener("load", update);
    desktop.addEventListener("change", update);
    reducedMotion.addEventListener("change", update);

    return () => {
      window.removeEventListener("load", update);
      desktop.removeEventListener("change", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled || failed) return;

    video.muted = true;
    // Autoplay can be blocked by browser policy; keep the poster and allow play.
    void video.play().catch(() => setPaused(true));

    return () => {
      video.pause();
      // Release an existing source when the viewport or motion preference changes.
      video.removeAttribute("src");
      video.load();
    };
  }, [enabled, failed]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setPaused(true));
    } else {
      video.pause();
    }
  }

  return (
    <figure
      aria-label="Tryline の紹介動画"
      className="tl-introduction-poster min-w-0"
    >
      <div className="relative aspect-video overflow-hidden rounded-sm bg-[var(--color-ink-strong)]">
        {failed ? (
          // Native image keeps the supplied poster URL and does not add fetchpriority.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Tryline 海外ラグビーを、日本語で。"
            className="h-full w-full object-contain"
            height={720}
            loading="eager"
            src={POSTER_SRC}
            width={1280}
          />
        ) : (
          <video
            aria-label="サイトとアプリの紹介（音なし）"
            autoPlay
            className="h-full w-full object-contain"
            height={720}
            loop
            muted
            onError={() => setFailed(true)}
            onPause={() => setPaused(true)}
            onPlay={() => setPaused(false)}
            playsInline
            poster={POSTER_SRC}
            preload="none"
            ref={videoRef}
            src={enabled ? VIDEO_SRC : undefined}
            width={1280}
          />
        )}
        {enabled && !failed && (
          <button
            aria-label={paused ? "紹介動画を再生" : "紹介動画を一時停止"}
            aria-pressed={paused}
            className="absolute bottom-2 right-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/40 bg-[var(--color-ink-strong)] px-4 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={togglePlayback}
            type="button"
          >
            {paused ? "再生" : "一時停止"}
          </button>
        )}
      </div>
      <figcaption className="mt-3 border-l border-[#e0c493] pl-4 text-white">
        <span className="block text-xs font-semibold tracking-[0.2em]">
          INTRODUCTION FILM
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-white/80">
          サイトとアプリの紹介（音なし）
        </span>
      </figcaption>
    </figure>
  );
}
