# X 個人感想ツイート自動生成（シャドウバン解除対策）

## 背景

@tryline_rugbyjp の X アカウントは現在シャドウバン状態にあり、公式アカウントへのリプライが他アカウントから見えない状態が続いている。

現在の自動投稿はすべて「告知・URL付きのプロモーション投稿」であり、アカウントの性質が宣伝ボットと判定されている可能性がある。シャドウバン解除には「一般ユーザーらしいURLなし投稿」を継続的に増やすことが有効とされている。

recap 生成時にすでに試合情報（スコア・トライ得点者・コンテンツ抜粋）が揃っているため、LLM で「ラグビーを観戦したファンの感想」スタイルのツイートを生成できる。

**方針:**
1. まず Discord 通知に「⑤ 感想ツイート案」を追加し、Owner が手動で投稿するフローから開始
2. シャドウバン解除が確認できたら自動投稿に移行（本仕様はフェーズ 1 = 手動投稿のみ）

## スコープ

対象:
- `lib/x/impression-tweet.ts`（新規）— 感想ツイート生成関数
- `app/api/cron/notify-discord/route.ts` — recap 時に ⑤ フィールドを追加

対象外:
- 自動投稿（フェーズ 2 以降）
- preview の感想ツイート（試合前は情報が薄いため対象外）
- 英語ツイート（JA のみ）
- 複数候補の生成（1候補のみ）

## データモデル変更

なし

## API サーフェス

### `lib/x/impression-tweet.ts`（新規）

```typescript
export type ImpressionTweetParams = {
  awayScore: number;
  awayTeamName: string;
  competitionLabel: string;
  homeScore: number;
  homeTeamName: string;
  recapExcerpt: string;        // recap コンテンツの先頭 200 文字程度
  tryScorers: TryScorer[];     // match_events から取得（0件でも可）
};

// OpenAI 軽量モデルで感想ツイートを生成する
// 失敗時は null を返す（呼び出し元がフォールバックする）
export async function generateImpressionTweet(
  params: ImpressionTweetParams,
): Promise<string | null>
```

### プロンプト仕様

**システムプロンプト:**
```
あなたはラグビーが好きな日本人ファンです。
試合を観たあと、自分の感想をXに投稿するツイートを1つ書いてください。

ルール:
- 日本語のみ。URLは含めない。
- 宣伝・告知の文体は禁止（「〜をチェック」「記事はこちら」等）。
- カジュアルな一人称（「〜だった」「〜した！」「〜すごい」等）。
- ハッシュタグは1〜2個のみ（大会名か #ラグビー）。
- 140文字以内。
- 試合の具体的な印象（接戦・逆転・選手の活躍など）を1つ含める。
- ツイート本文のみを出力し、他の文字は含めない。
```

**ユーザーメッセージ（入力例）:**
```
試合: チームA 27-24 チームB
大会: リーグワン
主なトライ得点者: 山田（2本）、鈴木（1本）
コンテンツ抜粋: 後半20分まで先制チームがリードしていたが、追撃チームの猛追で3点差に...
```

**出力例:**
```
チームAとチームB、最後まで目が離せなかった。山田の2トライ目で逃げ切り！あの接戦は今シーズンベスト級かも #リーグワン
```

### LLM 設定

- モデル: `lib/llm/models.ts` の軽量モデル定数を使用（gpt-4o-mini 相当）
- max_tokens: 120
- temperature: 0.9（バリエーションを出す）

LLM コスト見積もり（参考）:
- インプット ~300トークン、アウトプット ~80トークン
- 1試合あたり約 $0.00008（月200試合で約 $0.016 ≒ 2円）

## UI サーフェス

Discord embed に ⑤ フィールドを追加（recap のみ）:

```
⑤ 感想ツイート案（手動投稿用）

[生成されたツイート本文]
```

- コードブロック（` ``` `）で囲み、コピーしやすくする
- 生成失敗時はフィールドを省略する（Discord通知自体は止めない）

## 変更詳細

### `lib/x/impression-tweet.ts`（新規）

`TryScorer` 型は `lib/x/reply-text.ts` に既存のものを import して使う。

```typescript
import { openai } from "@/lib/llm/client";        // 既存 OpenAI クライアントのパスは要確認
import { LIGHTWEIGHT_MODEL } from "@/lib/llm/models"; // 定数名は要確認

import type { TryScorer } from "@/lib/x/reply-text";

export type ImpressionTweetParams = {
  awayScore: number;
  awayTeamName: string;
  competitionLabel: string;
  homeScore: number;
  homeTeamName: string;
  recapExcerpt: string;
  tryScorers: TryScorer[];
};

function buildUserMessage(params: ImpressionTweetParams): string {
  const scorersText =
    params.tryScorers.length > 0
      ? params.tryScorers
          .slice(0, 3)
          .map((s) =>
            s.count >= 2
              ? `${s.playerName}（${s.count}本）`
              : `${s.playerName}（1本）`,
          )
          .join("、")
      : "（データなし）";

  return [
    `試合: ${params.homeTeamName} ${params.homeScore}-${params.awayScore} ${params.awayTeamName}`,
    `大会: ${params.competitionLabel}`,
    `主なトライ得点者: ${scorersText}`,
    `コンテンツ抜粋: ${params.recapExcerpt.slice(0, 200)}`,
  ].join("\n");
}

export async function generateImpressionTweet(
  params: ImpressionTweetParams,
): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: LIGHTWEIGHT_MODEL,
      max_tokens: 120,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `あなたはラグビーが好きな日本人ファンです。
試合を観たあと、自分の感想をXに投稿するツイートを1つ書いてください。

ルール:
- 日本語のみ。URLは含めない。
- 宣伝・告知の文体は禁止（「〜をチェック」「記事はこちら」等）。
- カジュアルな一人称（「〜だった」「〜した！」「〜すごい」等）。
- ハッシュタグは1〜2個のみ（大会名か #ラグビー）。
- 140文字以内。
- 試合の具体的な印象（接戦・逆転・選手の活躍など）を1つ含める。
- ツイート本文のみを出力し、他の文字は含めない。`,
        },
        {
          role: "user",
          content: buildUserMessage(params),
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? null;
    return text ?? null;
  } catch {
    return null;
  }
}
```

### `app/api/cron/notify-discord/route.ts` の変更

recap 用の `tryScorers` 取得ロジックは `fix-discord-official-reply-draft.md` で追加済みのものを流用する。

```typescript
// recap のみ
if (content.content_type === "recap") {
  const impressionTweet = await generateImpressionTweet({
    awayScore: match.away_score ?? 0,
    awayTeamName: awayDisplayName,
    competitionLabel: competition?.name ?? "",
    homeScore: match.home_score ?? 0,
    homeTeamName: homeDisplayName,
    recapExcerpt: content.content_ja?.slice(0, 200) ?? "",
    tryScorers,
  });

  if (impressionTweet) {
    payload.embeds[0].fields.push({
      inline: false,
      name: "⑤ 感想ツイート案（手動投稿用）",
      value: `\`\`\`\n${impressionTweet}\n\`\`\``,
    });
  }
}
```

## 受け入れ条件

1. recap 生成後の Discord 通知に「⑤ 感想ツイート案（手動投稿用）」フィールドが追加される。
2. 生成されたツイートは URL を含まない。
3. 140文字以内に収まる（実装時に超過チェックを追加し、超過時はトリミングして `…` を末尾に付けること）。
4. 宣伝・告知の文体（「〜をチェック」「記事はこちら」等）が含まれないこと（プロンプトで制御）。
5. LLM 呼び出しが失敗した場合、⑤フィールドは省略され Discord 通知自体は正常送信される。
6. preview の Discord 通知は変更なし。
7. `tsc --noEmit` でビルドエラーなし。
8. `generateImpressionTweet` のユニットテストを追加:
   - 正常系: OpenAI がテキストを返した場合、そのテキストをそのまま返す。
   - 異常系: OpenAI が例外を投げた場合、null を返す。

## 未解決の質問

1. `lib/llm/client.ts`（または相当するファイル）の OpenAI クライアントのインポートパスを Codex が既存コードから確認すること。
2. `lib/llm/models.ts` の軽量モデルの定数名を Codex が確認すること。
3. `TryScorer` 型を `reply-text.ts` から import するか、`impression-tweet.ts` 内で再定義するか、Codex が既存パターンに合わせて判断すること。
4. フェーズ 2（自動投稿）に移行する際は `postTweetWithReply` を呼び出す別の処理を追加する（本仕様のスコープ外）。