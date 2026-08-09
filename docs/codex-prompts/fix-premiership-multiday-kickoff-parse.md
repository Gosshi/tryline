`specs/fix-premiership-multiday-kickoff-parse.md` の仕様を実装してください。

**着手前に必ず読むこと**: `lib/ingestion/sources/live-source-utils.ts` の 128-145行。**解決できない試合を個別にスキップして続行する既存パターン**です。本 spec ではこれと同じ形に揃えます。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要。2026-08-09 に本番実行して確認）**:
  - 本番ログの実エラー: `Failed to ingest premiership-2026-27: Error: Unable to locate Premiership kickoff text: 22/23/24 January 2027`
  - `lib/ingestion/sources/wikipedia-premiership.ts` の `parseKickoffAt`（59-67行）が `/(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})/` で単一日付＋時刻を要求し、一致しないと例外を投げる
  - **同一の実装が `lib/scrapers/wikipedia-premiership-results.ts` の97行にもある**
  - 例外は `ingestAllLiveCompetitions`（`live-competitions.ts` 123-143行）の `Promise.allSettled` で rejected になり、**結果配列から除外される**
  - 結果として **18ラウンド分の日程がすべて失われ、ワークフローは `status: "ok"` で success を報告した**。11大会が結果に並ぶ中で Premiership だけが消えていた
  - 同じ実行で Nations Championship の「NTH 1st vs STH 1st」等は `live-source-utils.ts` の経路でスキップされ、**他の試合は正常に取り込まれている**
  - **Premiership 2026-27 は 2026年9月25日開幕**。それまでに直す必要がある
- 変更対象:
  - `lib/ingestion/sources/wikipedia-premiership.ts`
  - `lib/scrapers/wikipedia-premiership-results.ts`

実装のポイント:
- **最重要は「1試合の解析失敗で大会全体を落とさない」ことです。** 日付表記への対応だけを直しても、別の未知の表記が出れば同じ全滅が起きます。**個別スキップの方が構造的な改善です**
- スキップは `live-source-utils.ts` 135-140行の「不明なチーム」と**同じ形**にしてください。新しい方式を発明しないこと
- 複数日表記をどう解釈するかは判断してよいです（先頭日を採る / 日付未定として扱う等）。**判断と根拠を報告してください**
- **実際の Wikipedia ページを確認し、他にどんな表記があるかを調べてから決めてください**（`22/23 January`、`TBC` 等の変種がありうる）。時刻が併記されない場合の扱いも決めること
- **2ファイルに同一実装があります。** 両方直すか共通化するかを判断してください。片方だけ直すと同じ知識が2箇所に残ります

エッジケース:
- 既存の単一日付表記（`25 September 2026 19:45` 等）が引き続き解析できること
- 時刻が無い表記
- 解析に失敗した試合をスキップしても、同じ大会の他の試合が取り込まれること
- スキップ件数が多い場合でもログが読める形であること

やらないこと:
- **`ingestAllLiveCompetitions` の `Promise.allSettled` 構造の変更**。失敗を結果に含める改善は有用ですが別 spec で扱います
- URC / Top 14 のパーサ変更。両大会は 2026-27 ページが未公開で `No matches found` となっており正常です
- Top 14 の正規シーズン欠落（既知の別課題）
- `teams` への新規クラブ登録
- 取り込み済みデータの変更

テスト:
- `22/23/24 January 2027` 形式で**例外を投げない**こと
- **1試合が解析失敗しても他の試合が返ること**（本 spec の中心的なテスト）
- スキップがログに残り、対戦カードが識別できること
- 既存の単一日付表記が壊れていないこと
- 2ファイルが同じ挙動であること（共通化した場合は不要）

完了の定義:
- spec の受け入れ条件1〜7をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **複数日表記をどう解釈したか、その根拠を報告してください**
- **実際の Wikipedia 2026-27 ページで、他にどんな日付表記があったかを報告してください**
- 2ファイルの重複をどう扱ったか（両方修正 / 共通化）を報告してください
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
