# Discord 通知に「公式アカウントへのリプライ案」を追加

## 背景

現在の Discord 通知（`app/api/cron/notify-discord/route.ts`）は recap 生成時に以下を送る:
- ① X に貼る（URLなし）— 自分のタイムライン用の投稿文
- ② リプライに貼る — URL 付きリプライ文
- ③ 記事を開く — 記事リンク

「リーグワン公式・J Sports・DAZN」など試合に関連する公式アカウントのツイートへ
**手動でリプライする際の下書き**が Discord 通知にないため、毎回手動で作成する必要がある。

recap 生成時に `match_events` から得点者を取得できるため、LLM コスト不要で決定論的に生成できる。

## スコープ

対象:
- `lib/x/notable-players.ts`（新規）— チームごとの有名選手リスト
- `lib/x/reply-text.ts`（新規）— `buildOfficialReplyText` 関数
- `app/api/cron/notify-discord/route.ts` — recap 時に ④ フィールドを追加

対象外:
- preview の Discord 通知（試合前リプライ案は別途検討）
- LLM による文章生成（決定論的に生成する）
- 自動投稿（手動投稿の下書きのみ）

## データモデル変更

なし（`match_events` は既存テーブル、`match_events.metadata->>'player_name'` を読み取り専用で使用）

## API サーフェス

なし

## UI サーフェス

Discord embed に ④ フィールドを追加（recap のみ）:

```
④ 公式へのリプライ案

🇯🇵
[日本語リプライ案]

🇬🇧
[英語リプライ案]
```

## 変更詳細

---

### 1. `lib/x/notable-players.ts`（新規）

チームごとの有名選手リストを管理するコンフィグファイル。
選手の追加・削除はここだけ変更すれば全体に反映される。

```typescript
export type NotablePlayer = {
  ja: string;   // カタカナ表記（ハッシュタグ用・スペースなし）
  en: string;   // 英語表記（ハッシュタグ用・スペースなし）
};

// key: teams.name（DB の値と完全一致させること）
export const NOTABLE_PLAYERS_BY_TEAM: Record<string, NotablePlayer[]> = {
  "コベルコ神戸スティーラーズ": [
    { ja: "ブロディレタリック", en: "BrodieRetallick" },
    { ja: "アーディサベア", en: "ArdieSavea" },
    { ja: "アントンリネルトブラウン", en: "AntonLienertBrown" },
  ],
  "東京サントリーサンゴリアス": [
    { ja: "チェスリンコルビ", en: "CheslinKolbe" },
    { ja: "中野将伍", en: "ShogoNakano" },
  ],
  "埼玉パナソニックワイルドナイツ": [
    { ja: "マルコムマークス", en: "MalcolmMarx" },
  ],
  "クボタスピアーズ船橋・東京ベイ": [
    { ja: "バーナードフォーリー", en: "BernardFoley" },
  ],
};

export function getNotablePlayers(teamName: string): NotablePlayer[] {
  return NOTABLE_PLAYERS_BY_TEAM[teamName] ?? [];
}
```

---

### 2. `lib/x/reply-text.ts`（新規）

```typescript
export type TryScorer = {
  count: number;
  playerName: string;
};

export type OfficialReplyParams = {
  awayScore: number;
  awayTeamName: string;
  competitionFamily: string | null;
  homeScore: number;
  homeTeamName: string;
  language: "ja" | "en";
  tryScorers: TryScorer[];
};

export function buildOfficialReplyText(params: OfficialReplyParams): string
```

**生成ルール:**

スコア行:
- ja: `{homeTeam} {homeScore}-{awayScore}。`
- en: `{homeTeam} {homeScore}-{awayScore} {awayTeam}.`

トライ強調（上位2名まで）:
- ja: 2トライ以上 → 「{選手名}が{N}トライ」、1トライ → 「{選手名}がトライ」
- en: 2トライ以上 → "{Name} scored {N} tries"、1トライ → "{Name} scored a try"
- スコアラー0人（データスパース）→ スコア行のみ

ハッシュタグ:
- 両チームの `getNotablePlayers()` を結合し先頭3名まで使用
- 大会ハッシュタグは `HASHTAGS_BY_FAMILY`（既存 `lib/x/post.ts`）を流用

---

### 3. `app/api/cron/notify-discord/route.ts` の変更

**match_events の追加クエリ（recap のみ）:**

```typescript
let tryScorers: TryScorer[] = [];

if (content.content_type === "recap") {
  const { data: events } = await db
    .from("match_events")
    .select("metadata")
    .eq("match_id", content.match_id)
    .eq("type", "try");

  const scorerMap = new Map<string, number>();
  for (const event of events ?? []) {
    const name = (event.metadata as { player_name?: string })?.player_name ?? "";
    if (name) scorerMap.set(name, (scorerMap.get(name) ?? 0) + 1);
  }
  tryScorers = [...scorerMap.entries()]
    .map(([playerName, count]) => ({ playerName, count }))
    .sort((a, b) => b.count - a.count);
}
```

**④⑤ フィールドの追加（recap のみ、両チャンネル共通）:**

日本語・英語を**別フィールド**に分けて追加する。

```typescript
if (content.content_type === "recap") {
  const baseParams = {
    awayScore: match.away_score ?? 0,
    awayTeamName: awayDisplayName,
    competitionFamily: competition?.family ?? null,
    homeScore: match.home_score ?? 0,
    homeTeamName: homeDisplayName,
    tryScorers,
  };
  const jaReply = buildOfficialReplyText({ ...baseParams, language: "ja" });
  const enReply = buildOfficialReplyText({ ...baseParams, language: "en" });

  payload.embeds[0].fields.push(
    {
      inline: false,
      name: "④ 公式へのリプライ案 🇯🇵",
      value: `\`\`\`\n${jaReply}\n\`\`\``,
    },
    {
      inline: false,
      name: "⑤ 公式へのリプライ案 🇬🇧",
      value: `\`\`\`\n${enReply}\n\`\`\``,
    },
  );
}
```

- 両フィールドとも **JA チャンネル・EN チャンネルの両方**に送信する
- Discord embed の `value` は最大1024文字。各フィールドが超過する場合は文字数を切り詰めること

---

## 受け入れ条件

1. recap 生成後の Discord 通知に「④ 公式へのリプライ案」フィールドが追加される。
2. 日本語・英語の両方が出力される。
3. トライスコアラーが `match_events` に存在する場合、上位2名が本文に含まれる。
4. `getNotablePlayers()` で取得した有名選手のハッシュタグが含まれる（最大3名）。
5. `match_events` が空の場合（データスパース）、スコア行のみで正常終了する。
6. `notable-players.ts` に選手を追加すれば次回通知から反映される。
7. preview の Discord 通知は変更なし。
8. `tsc --noEmit` でビルドエラーなし。
9. `buildOfficialReplyText` のユニットテストを追加:
   - トライスコアラー2名・有名選手あり → 期待する文字列が出力される
   - トライスコアラー0人 → スコア行のみ出力
   - 2トライ以上の選手 → 「Nトライ」表記になる

## 未解決の質問

1. `notable-players.ts` の初期リストは spec 記載のものでよいか。追加・修正は Owner が直接編集する運用。

※ Q2・Q3 は決定済み:
- リプライ案は **JA・EN 両チャンネル**に送る
- 日本語・英語は **別フィールド（④⑤）**に分割する