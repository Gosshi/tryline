# Codex Prompt: 得点経過タイムライン空列の修正

## 背景

UI 監査で「一方のチームが 0 得点の試合（例: France 43–0 Wales）で、アウェイ列が完全に空になり、レイアウトバグのように見える」と指摘された。

---

## 変更対象

`components/match-events-section.tsx` のみ。

## 現状

イベントは `grid-cols-[1fr_3rem_1fr]` の 2 列で表示される。各行でホームチームのイベントは左列、アウェイチームのイベントは右列に出力し、反対側は空文字列 `""` にしている。

```tsx
<span className="min-w-0 truncate text-sm text-slate-700">
  {isHome ? label : ""}
</span>
// ...
<span className="min-w-0 truncate text-right text-sm text-slate-700">
  {!isHome ? label : ""}
</span>
```

一方のチームが無得点の場合、該当列が全行で空のままになる。

## 変更内容

イベントリストの末尾に、無得点チームがある場合のみ「得点なし」の注記を追加する。レイアウト構造は変更しない。

`MatchEventsSection` 関数内で、イベントをホーム・アウェイに分類する:

```tsx
const sorted = sortEvents(events);
const homeEvents = sorted.filter((e) => e.teamId === homeTeamId);
const awayEvents = sorted.filter((e) => e.teamId !== homeTeamId);
```

イベントリストの `<div className="space-y-0.5">` の直後に追記する:

```tsx
{(homeEvents.length === 0 || awayEvents.length === 0) && (
  <p className="mt-3 text-center text-xs text-slate-400">
    {homeEvents.length === 0
      ? `${homeTeamName}: 得点なし`
      : `${awayTeamName}: 得点なし`}
  </p>
)}
```

## 完了条件

- [ ] 一方のチームが 0 得点の試合で「{チーム名}: 得点なし」の注記が表示される
- [ ] 両チームともイベントがある場合は注記が表示されない
- [ ] グリッドレイアウト・イベント行の表示ロジックは変更なし
- [ ] `pnpm tsc --noEmit` がパスする

## 変更しないこと

- `sortEvents` 関数
- `EVENT_TYPE_LABEL` マップ
- グリッドレイアウトの構造
