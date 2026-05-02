# p2-ai-chat: 試合別 AI チャット

## 背景

各試合ページに AI チャット機能を追加し、Premium ユーザーが日本語でラグビー観戦の
疑問や分析を質問できるようにする。チャットのコンテキストは試合データ
（スコア・イベント・ラインアップ・recap）で構成され、毎回フルスクレイプしない。

## スコープ

対象:
- 試合詳細ページへのチャット UI 追加
- streaming レスポンス（Server-Sent Events）
- セッション・メッセージの DB 保存
- Premium ガード（Free ユーザーには paywall）
- コスト上限（セッションあたりトークン上限）

対象外:
- 複数試合横断の質問
- 音声入力
- チャット履歴の公開・共有

## データモデル変更

### 新規テーブル: `chat_sessions`

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | セッション ID |
| user_id | uuid | `auth.users.id` 参照 |
| match_id | uuid | `matches.id` 参照 |
| created_at | timestamptz | 作成日時 |

RLS: 本人のみ read/insert 可。

### 新規テーブル: `chat_messages`

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | メッセージ ID |
| session_id | uuid | `chat_sessions.id` 参照 |
| role | text | `'user'` / `'assistant'` |
| content | text | メッセージ本文 |
| input_tokens | int | LLM input トークン数 |
| output_tokens | int | LLM output トークン数 |
| cost_usd | numeric(10,6) | このメッセージのコスト |
| created_at | timestamptz | 作成日時 |

RLS: 本人のみ read/insert 可。

セッションあたり合計トークン数 ≤ 50,000 で上限メッセージを返す。

## API サーフェス

### `POST /api/chat/[matchId]`

**Request:**
```json
{
  "sessionId": "uuid（省略時は新規作成）",
  "message": "イングランドのスクラムが弱かった理由は？"
}
```

**Response:** `text/event-stream`（SSE）
```
data: {"delta": "イングランドのスクラムは"}
data: {"delta": "プロップの負傷により..."}
data: {"done": true, "sessionId": "uuid"}
```

### システムプロンプト構成

1. 試合基本情報（スコア・チーム・会場・日時）
2. 試合イベント（得点シーケンス）
3. ラインアップ（先発・リザーブ）
4. `match_content` の recap 本文（あれば）
5. 応答方針: 日本語 / ラグビー用語は英語 OK / 推測は「〜と思われます」で明示

モデル: `gpt-4o-mini`（`MODELS.FAST`）/ Temperature: 0.5

## UI サーフェス

### チャットパネル（`components/match-chat.tsx`）

- 試合詳細ページの最下部に配置
- Premium: メッセージ入力 + 送信ボタン + 履歴表示、ストリーミング中はカーソル表示
- Free: paywall（「AI チャットは Premium でご利用いただけます」）
- `Enter` で送信、`Shift+Enter` で改行

## LLM 連携

- パイプラインとは独立したリアルタイム呼び出し
- コンテキスト組み立て: `assembleMatchContentInput(matchId)` を再利用
- Streaming: OpenAI Responses API の `stream: true`

## 受け入れ条件

- [ ] Premium ユーザーが試合ページでメッセージを送るとストリーミングで回答が返る
- [ ] Free ユーザーにはチャット欄が paywall で隠れる
- [ ] セッションとメッセージが DB に保存される
- [ ] 50,000 token 上限を超えた場合に上限メッセージを返す
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- セッション有効期限を設けるか（試合終了から 7 日 etc.）
- 1日あたりのメッセージ数制限を設けるか（スパム防止）
- recap がない試合（2020–2024 履歴）でもチャットを開放するか
