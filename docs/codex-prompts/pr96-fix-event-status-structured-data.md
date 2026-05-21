# PR #96 — 構造化データの eventStatus を修正

## 背景

Google Search Console から `eventStatus` の欠落を指摘されている。
`app/matches/[id]/page.tsx` の JSON-LD に 2 つの問題がある。

1. `eventStatus` が `match.status === "finished"` のブロック内にしかなく、
   `scheduled` / `in_progress` / `postponed` / `cancelled` の試合では欠落している
2. `finished` の試合に `"https://schema.org/EventScheduled"` を設定しており、
   本来の `EventCompleted` と逆になっている

## スコープ

対象:
- `app/matches/[id]/page.tsx`

対象外:
- その他のファイル変更なし

---

## 変更仕様

`jsonLd` オブジェクトの `eventStatus` を常に含め、`match.status` に基づいて正しい値を設定する。

### ステータスマッピング

| `match.status` | `eventStatus` |
|---|---|
| `scheduled` | `https://schema.org/EventScheduled` |
| `in_progress` | `https://schema.org/EventScheduled` |
| `finished` | `https://schema.org/EventCompleted` |
| `postponed` | `https://schema.org/EventPostponed` |
| `cancelled` | `https://schema.org/EventCancelled` |

### 実装イメージ

```ts
function toEventStatus(status: MatchStatus): string {
  switch (status) {
    case "finished":
      return "https://schema.org/EventCompleted";
    case "postponed":
      return "https://schema.org/EventPostponed";
    case "cancelled":
      return "https://schema.org/EventCancelled";
    default:
      return "https://schema.org/EventScheduled";
  }
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SportsEvent",
  eventStatus: toEventStatus(match.status),
  // ...既存フィールド
};
```

既存の `...(match.status === "finished" ? { eventStatus: ... } : {})` のスプレッド記法は削除し、
`eventStatus` をトップレベルに常設する。

---

## 完了の定義

- [ ] すべての試合ページで `eventStatus` が JSON-LD に含まれている
- [ ] `finished` の試合は `EventCompleted`、`scheduled` は `EventScheduled` になっている
- [ ] TypeScript エラーなし・`pnpm build` 通過
