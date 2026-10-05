"use client";

import { type MouseEvent, useEffect, useId, useRef, useState } from "react";

const POSTER_SRC = "/videos/tryline-promo-poster.jpg";
const VIDEO_SRC = "/videos/tryline-promo-720p.mp4";

export function HomeIntroFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogVideoRef = useRef<HTMLVideoElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const resumeInlineRef = useRef(false);
  const dialogTitleId = useId();
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dialogFailed, setDialogFailed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setReady(true);
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

  useEffect(() => {
    const video = dialogVideoRef.current;
    if (!expanded || dialogFailed || !video) return;

    video.muted = true;
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [expanded, dialogFailed]);

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    expandButtonRef.current = event.currentTarget;
    const inlineVideo = videoRef.current;
    resumeInlineRef.current = Boolean(inlineVideo && !inlineVideo.paused);
    inlineVideo?.pause();
    setDialogFailed(false);
    setExpanded(true);
    dialog.showModal();
    closeButtonRef.current?.focus();
  }

  function handleDialogClose() {
    setExpanded(false);
    const inlineVideo = videoRef.current;
    if (resumeInlineRef.current && enabled && !failed && inlineVideo) {
      void inlineVideo.play().catch(() => setPaused(inlineVideo.paused));
    }
    resumeInlineRef.current = false;
    expandButtonRef.current?.focus();
  }

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
        <button
          aria-label="紹介動画を拡大して見る"
          className="tl-intro-expand absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
          disabled={!ready}
          onClick={openDialog}
          type="button"
        >
          <span className="tl-intro-expand-icon absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-[var(--color-ink-strong)] text-white">
            <svg
              aria-hidden="true"
              fill="none"
              height="28"
              viewBox="0 0 24 24"
              width="28"
            >
              <path
                d="M8 3H3v5m0-5 6 6m7-6h5v5m0-5-6 6M3 16v5h5m-5 0 6-6m12 1v5h-5m5 0-6-6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            </svg>
          </span>
        </button>
        {enabled && !failed && (
          <button
            aria-label={paused ? "紹介動画を再生" : "紹介動画を一時停止"}
            aria-pressed={paused}
            className="absolute bottom-2 right-2 z-20 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/40 bg-[var(--color-ink-strong)] px-4 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={togglePlayback}
            type="button"
          >
            {paused ? "再生" : "一時停止"}
          </button>
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 border-l border-[#e0c493] pl-4 text-white">
        <div>
          <span className="block text-xs font-semibold tracking-[0.2em]">
            INTRODUCTION FILM
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-white/80">
            サイトとアプリの紹介（音なし）
          </span>
        </div>
        <button
          className="inline-flex min-h-11 items-center rounded-full border border-white/40 px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          disabled={!ready}
          onClick={openDialog}
          type="button"
        >
          拡大して見る
        </button>
      </figcaption>
      <dialog
        aria-labelledby={dialogTitleId}
        className="tl-intro-dialog"
        onCancel={(event) => {
          event.preventDefault();
          dialogRef.current?.close();
        }}
        onClose={handleDialogClose}
        ref={dialogRef}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-base font-semibold" id={dialogTitleId}>
            Tryline の紹介動画を拡大
          </p>
          <button
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/40 px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={() => dialogRef.current?.close()}
            ref={closeButtonRef}
            type="button"
          >
            閉じる
          </button>
        </div>
        {expanded && (
          <div className="aspect-video overflow-hidden bg-[var(--color-ink-strong)]">
            {dialogFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Tryline 海外ラグビーを、日本語で。"
                className="h-full w-full object-contain"
                height={720}
                src={POSTER_SRC}
                width={1280}
              />
            ) : (
              <video
                aria-label="サイトとアプリの紹介・拡大表示（音なし）"
                autoPlay
                className="h-full w-full object-contain"
                controls
                height={720}
                muted
                onError={() => setDialogFailed(true)}
                playsInline
                poster={POSTER_SRC}
                preload="none"
                ref={dialogVideoRef}
                src={VIDEO_SRC}
                width={1280}
              />
            )}
          </div>
        )}
      </dialog>
    </figure>
  );
}
