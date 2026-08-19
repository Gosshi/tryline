import {
  getIosAppStoreUrl,
  type IosAppCtaSurface,
} from "@/lib/ios-app";

type IosAppCtaProps = {
  surface: IosAppCtaSurface;
};

export function IosAppCta({ surface }: IosAppCtaProps) {
  return (
    <section className="border-l-4 border-[var(--color-accent)] bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        iPhone・iPad アプリ
      </p>
      <p className="mt-1 text-sm font-bold text-[var(--color-ink)]">
        試合開始前に通知します
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
        気になる試合のキックオフ前に、iOSアプリでお知らせを受け取れます。
      </p>
      <a
        className="mt-3 inline-flex rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-ink)]"
        href={getIosAppStoreUrl(surface)}
      >
        iOSアプリで通知を受け取る
      </a>
    </section>
  );
}
