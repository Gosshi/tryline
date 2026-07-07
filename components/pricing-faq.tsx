"use client";

import { useState } from "react";

export type PricingFaqItem = {
  answer: string;
  question: string;
};

type PricingFaqProps = {
  faqs: PricingFaqItem[];
};

export function PricingFaq({ faqs }: PricingFaqProps) {
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const [hero, ...items] = faqs;

  if (!hero) {
    return null;
  }

  function toggle(question: string) {
    setOpenQuestions((current) =>
      current.includes(question)
        ? current.filter((item) => item !== question)
        : [...current, question],
    );
  }

  return (
    <div className="space-y-3">
      <article className="rounded-2xl bg-white p-6 shadow-[0_18px_38px_rgb(15_23_42/0.08)] ring-1 ring-slate-200 sm:p-7">
        <h3 className="text-xl font-bold tracking-tight text-[var(--color-ink)] sm:text-2xl">
          {hero.question}
        </h3>
        <p className="mt-3 text-sm leading-7 text-[var(--color-ink-muted)]">
          {hero.answer}
        </p>
      </article>

      <div className="divide-y divide-slate-200 rounded-2xl bg-white px-2 shadow-sm ring-1 ring-slate-200">
        {items.map((faq, index) => {
          const isOpen = openQuestions.includes(faq.question);
          const panelId = `pricing-faq-${index + 1}`;

          return (
            <article key={faq.question}>
              <h3>
                <button
                  aria-controls={panelId}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-4 text-left text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  onClick={() => toggle(faq.question)}
                  type="button"
                >
                  <span>{faq.question}</span>
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-base font-bold text-[var(--color-ink-muted)]"
                  >
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
              </h3>
              {isOpen && (
                <div
                  className="px-3 pb-4 text-sm leading-7 text-[var(--color-ink-muted)]"
                  id={panelId}
                >
                  {faq.answer}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
