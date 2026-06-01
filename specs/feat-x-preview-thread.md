# X プレビュースレッド投稿

## 背景

現在の X 自動投稿は recap のみで、preview は手動投稿。
また投稿形式は「告知リンク1枚」のみで宣伝色が強く、フォロワーを増やしにくい。

preview コンテンツは試合前（熱量が高いタイミング）に投稿でき、有料の recap を切り売りせずに済む。
3ツイートのスレッド形式にすることで、読み応えのある情報としてエンゲージメントを高める。

```
ツイート1: 試合の核心（フック）
ツイート2: 注目ポイント3点
ツイート3: 全文リンク（現在のリプライと同じ）
```

## スコープ

対象:
- `lib/x/preview-thread.ts`（新規）— プレビュースレッド用テキスト生成
- `app/api/cron/notify-discord/route.ts` — preview 通知に「⑤ プレビュースレッド案」フィールドを追加

対象外:
- 自動投稿（Discord 通知への追加のみ。手動投稿フロー）
- EN 版（JA のみ）
- recap スレッド化（有料コンテンツのため対象外）

## データモデル変更

なし

## API サーフェス

### `lib/x/preview-thread.ts`（新規）

```typescript
export type PreviewThreadParams = {
  awayTeamName: string;
  competitionFamily: string | null;
  competitionLabel: string;
  homeTeamName: string;
  matchId: string;
  previewMarkdown: string;  // match_content.content_md（JA）
};

export type PreviewThread = {
  tweet1: string;  // 核心フック（140字以内）
  tweet2: string;  // 注目ポイント（140字以内）
  tweet3: string;  // リンク（buildReplyText と同じ）
};

// OpenAI 軽量モデルでスレッドテキストを生成する
// 失敗時は null を返す
export async function generatePreviewThread(
  params: PreviewThreadParams,
): Promise<PreviewThread | null>
```

### プロンプト仕様

**システムプロンプト:**
```
ラグビーのプレビュー記事をもとに、X（Twitter）スレッド用のツイートを2本生成してください。

【ツイート1: 核心フック】
- 「# この試合の核心」セクションの問いを1文に絞り、120字以内で書くこと
- 語尾は「——か？」「——なるか」など問いかけ形式を維持する
- ハッシュタグなし、URLなし

【ツイート2: 注目ポイント】
- プレビュー全体から「注目ポイント」を3点、箇条書き（-）で書くこと
- 全体120字以内
- 末尾にハッシュタグを1〜2個付ける
- URLなし

出力形式（JSON）: {"tweet1": "...", "tweet2": "..."}
```

### LLM 設定

- モデル: `MODELS.FAST`（`lib/llm/models.ts`）
- max_tokens: 300
- temperature: 0.7
- response_format: `{ type: "json_object" }`

LLM コスト見積もり:
- インプット ~500トークン、アウトプット ~150トークン
- 1試合あたり約 $0.0001（月200試合で約 $0.02 ≒ 3円）

### ツイート3

`buildReplyText(matchId, "ja")` をそのまま流用（`lib/x/post.ts` の既存関数）。

## UI サーフェス

Discord embed の preview 通知に「⑤ プレビュースレッド案（手動投稿用）」フィールドを追加。

```
⑤ プレビュースレッド案（手動投稿用）

🐦 ツイート1
```[核心フック]```

🐦 ツイート2
```[注目ポイント]```

🐦 ツイート3（リプライ）
```[URL + CTA]```
```

Discord embed の `value` は最大1024文字。超過する場合は「⑤-1」「⑤-2」に分割すること。

## 変更詳細

### `lib/x/preview-thread.ts`（新規）

```typescript
import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";
import { buildReplyText } from "@/lib/x/post";

export type PreviewThreadParams = {
  awayTeamName: string;
  competitionFamily: string | null;
  competitionLabel: string;
  homeTeamName: string;
  matchId: string;
  previewMarkdown: string;
};

export type PreviewThread = {
  tweet1: string;
  tweet2: string;
  tweet3: string;
};

export async function generatePreviewThread(
  params: PreviewThreadParams,
): Promise<PreviewThread | null> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      max_tokens: 300,
      messages: [
        {
          content: `ラグビーのプレビュー記事をもとに、X（Twitter）スレッド用のツイートを2本生成してください。

【ツイート1: 核心フック】
- 「# この試合の核心」セクションの問いを1文に絞り、120字以内で書くこと
- 語尾は「——か？」「——なるか」など問いかけ形式を維持する
- ハッシュタグなし、URLなし

【ツイート2: 注目ポイント】
- プレビュー全体から「注目ポイント」を3点、箇条書き（-）で書くこと
- 全体120字以内
- 末尾にハッシュタグを1〜2個付ける
- URLなし

出力形式（JSON）: {"tweet1": "...", "tweet2": "..."}`,
          role: "system",
        },
        {
          content: [
            `大会: ${params.competitionLabel}`,
            `${params.homeTeamName} vs ${params.awayTeamName}`,
            "",
            params.previewMarkdown.slice(0, 800),
          ].join("\n"),
          role: "user",
        },
      ],
      model: MODELS.FAST,
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { tweet1?: unknown; tweet2?: unknown };
    const tweet1 =
      typeof parsed.tweet1 === "string" ? parsed.tweet1.trim() : null;
    const tweet2 =
      typeof parsed.tweet2 === "string" ? parsed.tweet2.trim() : null;

    if (!tweet1 || !tweet2) return null;

    return {
      tweet1,
      tweet2,
      tweet3: buildReplyText(params.matchId, "ja"),
    };
  } catch {
    return null;
  }
}
```

### `app/api/cron/notify-discord/route.ts` の変更

preview 通知のビルド箇所に追加（`language === "ja"` の preview のみ）:

```typescript
if (content.content_type === "preview" && content.language === "ja") {
  const thread = await generatePreviewThread({
    awayTeamName: awayDisplayName,
    competitionFamily: competition?.family ?? null,
    competitionLabel,
    homeTeamName: homeDisplayName,
    matchId: content.match_id,
    previewMarkdown: content.content_md ?? "",
  });

  if (thread) {
    embed.fields.push({
      inline: false,
      name: "⑤ プレビュースレッド案（手動投稿用）",
      value: truncateDiscordCodeBlockValue(
        [
          "🐦 ツイート1",
          `\`\`\`\n${thread.tweet1}\n\`\`\``,
          "🐦 ツイート2",
          `\`\`\`\n${thread.tweet2}\n\`\`\``,
          "🐦 ツイート3（リプライ）",
          `\`\`\`\n${thread.tweet3}\n\`\`\``,
        ].join("\n"),
      ),
    });
  }
}
```

`truncateDiscordCodeBlockValue` は既存の1024字制限トリム関数を流用。
1024字を超える場合はフィールドを「⑤-1」「⑤-2」に分割すること。

## 受け入れ条件

1. preview 生成後の Discord 通知に「⑤ プレビュースレッド案（手動投稿用）」が追加される。
2. ツイート1が120字以内で、問いかけ形式の文になっている。
3. ツイート2に箇条書き3点とハッシュタグが含まれる。
4. ツイート3が `buildReplyText(matchId, "ja")` と同じ URL + CTA になっている。
5. LLM 呼び出し失敗時はフィールドを省略し、Discord 通知自体は正常送信される。
6. recap 通知・EN preview 通知は変更なし。
7. `tsc --noEmit` でビルドエラーなし。
8. `generatePreviewThread` のユニットテストを追加:
   - 正常系: OpenAI が有効な JSON を返す → `PreviewThread` オブジェクトを返す
   - 異常系: OpenAI が例外を投げる → null を返す
   - tweet1・tweet2 どちらかが欠ける JSON → null を返す

## 未解決の質問

1. Discord embed `value` の1024字制限に引っかかる場合、Codex がフィールド分割を実装すること（「⑤-1」「⑤-2」）。
2. `truncateDiscordCodeBlockValue` がコードブロック付き文字列でも正しくトリムされるか Codex が確認すること。
3. preview の Discord 通知が現在 JA のみ送信か EN も送信かを Codex が既存実装で確認し、条件分岐を適切に設定すること。
