# 週次ラグビーまとめ自動生成 cron

## 背景

毎週月曜夜、先週末（土〜日）の試合結果をLLMで日本語まとめ原稿に自動生成し、Discord webhook へ送信する。Ownerがその原稿をコピーして note.com に貼るのが最終ゴール。現状は手動で原稿を書いているため、この作業を自動化する。

## スコープ

**対象:**
- 先週の土曜〜日曜（JST）にキックオフされた全海外大会の試合
- `home_score` / `away_score` が両方入っている（終了済み）試合のみ
- 試合数が0件の週はスキップ（Discord に何も送らない）

**対象外:**
- note.com への自動投稿（人間が手動でコピペする）
- リーグワン（league-one family）は国内コンテンツのため除外
- プレビュー（未来の試合）は本機能に含めない

## 実行タイミング

毎週月曜 21:00 JST = **UTC 12:00**

## 実装詳細

### 既存のcron方式（GitHub Actions + curl）

このプロジェクトのcronはすべて `.github/workflows/cron-*.yml` で定義し、GitHub Actions の `schedule` から Vercel にデプロイされた API route を `curl` で叩く方式。`vercel.json` のcron機能は使っていない。

### 新規ファイル

```
app/api/cron/weekly-digest/route.ts     ← API route 本体
.github/workflows/cron-weekly-digest.yml ← GHA cron 定義
```

### 処理フロー

```
1. 先週土曜 00:00 JST 〜 日曜 23:59 JST の試合を matches テーブルから取得
   - home_score IS NOT NULL AND away_score IS NOT NULL
   - competition.family != 'league-one'
   - kickoff_at ASC ソート
   - JOIN: competitions（family, name_ja）, teams（name）

2. 試合データを整形してプロンプトに渡す

3. GPT-4o でまとめ原稿を生成（後述プロンプト参照）

4. 生成原稿を Discord webhook に送信
   - 2000文字を超える場合は改行単位で分割して複数メッセージを順番にPOST
   - コードブロックで囲まない（Markdownをそのまま貼れるよう平文で送る）
   - 最初のメッセージの冒頭に「📋 note 原稿（コピペ用）」と1行付ける

5. 正常終了を返す
```

### 環境変数

既存の `DISCORD_WEBHOOK_JA` / `DISCORD_WEBHOOK_EN` とは別チャンネルに送る。

```
DISCORD_WEBHOOK_WEEKLY_DIGEST=<Ownerが発行したWebhook URL>
```

登録場所:
- **Vercel ダッシュボード** → Project Settings → Environment Variables に追加（Production / Preview / Development）
- **`.env.local`** → ローカル動作確認用に追加
- `lib/env.ts` の `serverEnvSchema` に追加（後述）

`optional()` にする理由: 未設定の場合はスキップして正常終了（エラーにしない）。

### LLM プロンプト

モデル: `lib/llm/models.ts` の `NARRATIVE_MODEL`（gpt-4o）

**システムプロンプト:**
```
あなたはラグビーメディア「Tryline」の日本語編集者です。
提供された先週末の試合データをもとに、note.com への投稿原稿を生成してください。

出力形式:
- Markdown形式（# タイトル, ## 見出し, ### 小見出し, **太字**, [text](url) リンク）
- 構成: タイトル → リード文（2〜3文） → 大会別セクション → フッター
- 各試合に Tryline のレビューリンクを「→ [試合レビュー（日本語）](URL)」形式で付ける
- タイトルに「【今週の海外ラグビーまとめ】」を必ず含める。末尾に「（YYYY.M.D–M.D）」の期間を付ける

制約:
- スコア・選手名・開催地は提供データのみ使う（推測・捏造厳禁）
- ラグビー一般知識（チームの特徴、大会説明、ライバル関係）は活用してよい
- 語尾は「でした」「です」等の丁寧体で統一
- 末尾に必ず「👉 [trylinerugby.com](https://www.trylinerugby.com)」を入れる
```

**ユーザープロンプト（動的生成）:**
```
以下の試合データをもとに、今週末のまとめ原稿を書いてください。

【期間】{YYYY年M月D日（土）〜 M月D日（日）}

【試合結果】
大会: {name_ja}
{ホームチーム名} {ホームスコア}–{アウェイスコア} {アウェイチーム名}
日付: {M月D日（曜日） HH:MM JST}
レビューURL: https://www.trylinerugby.com/matches/{match_id}

（試合ごとに空行区切り）
```

### Discord 送信の分割ロジック

Discordのメッセージ上限は2000文字。原稿が超える場合は改行単位で分割して順番にPOSTする。

```ts
function splitIntoChunks(text: string, maxLen = 1900): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
```

チャンク間に短い待機（100ms程度）を入れてDiscord側のレートリミットを避ける。

### LLM コスト見積もり

週5〜15試合想定、プロンプト〜800tok + 出力〜1200tok ≒ gpt-4o で **1回あたり約$0.014**。月4回で **約$0.06/月**。

## データモデル変更

なし。既存テーブルを読み取るのみ。

## 受け入れ条件

- [ ] 月曜 21:00 JST（UTC 12:00）に自動実行される（vercel.json の cron 設定）
- [ ] 先週土日の終了済み試合のみ取得される（スコアがnullの試合を除外）
- [ ] league-one family の試合が含まれない
- [ ] 試合が0件の週は Discord に何も送らず 200 を返す
- [ ] `DISCORD_WEBHOOK_WEEKLY_DIGEST` が未設定の場合はスキップして正常終了する
- [ ] 生成原稿のスコアが取得データと一致している（捏造がない）
- [ ] 2000文字超の場合に正しく分割されて送信される
- [ ] note.com に貼ったとき見出し・太字・リンクが正しく機能する

## 未解決の質問

なし（Owner 判断済み: 人間がnoteに貼る、月曜夜、全文生成、league-one 除外）
