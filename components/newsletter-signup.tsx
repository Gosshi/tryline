"use client";

import { useEffect, useRef, useState } from "react";

import {
  trackNewsletterResult,
  trackNewsletterSubmit,
  trackNewsletterView,
  type NewsletterSource,
} from "@/lib/analytics";

type NewsletterSignupProps = {
  source: NewsletterSource;
};

export function NewsletterSignup({ source }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const hasTrackedView = useRef(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          !entry?.isIntersecting ||
          entry.intersectionRatio < 0.5 ||
          hasTrackedView.current
        ) {
          return;
        }

        hasTrackedView.current = true;
        trackNewsletterView({ source });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(section);

    return () => observer.disconnect();
  }, [source]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    trackNewsletterSubmit({ source });
    setMessage("");

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        body: JSON.stringify({ email, source }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (response.status === 429) {
        setMessage("しばらくしてから、もう一度お試しください。");
        trackNewsletterResult({ source, status: "rate_limited" });
      } else if (!response.ok) {
        setMessage("登録を受け付けられませんでした。入力内容を確認してください。");
        trackNewsletterResult({ source, status: "error" });
      } else {
        setEmail("");
        setMessage(
          "必要な手続きをメールでお知らせします。受信箱をご確認ください。",
        );
        trackNewsletterResult({ source, status: "ok" });
      }
    } catch {
      setMessage("通信に失敗しました。しばらくしてから、もう一度お試しください。");
      trackNewsletterResult({ source, status: "network_error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="border-l-4 border-[var(--color-accent)] bg-slate-50 px-4 py-4"
      ref={sectionRef}
    >
      <p className="text-sm font-bold text-[var(--color-ink)]">
        週次ニュースレター
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
        週に1回、週末の海外ラグビーの試合結果を日本語でまとめて送ります。
      </p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={`newsletter-email-${source}`}>
          メールアドレス
        </label>
        <input
          autoComplete="email"
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--color-accent)]"
          id={`newsletter-email-${source}`}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <button
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "送信中…" : "無料で受け取る"}
        </button>
      </form>
      <p aria-live="polite" className="mt-2 text-xs text-[var(--color-ink-muted)]">
        {message || "登録後、確認メールのリンクを開くと配信が始まります。"}
      </p>
    </section>
  );
}
