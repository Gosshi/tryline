仕様書 `specs/feat-discord-source-url-owner-verified.md` を実装してください。**先に全文を読んでください。** 決定の根拠は `docs/decisions.md` の D032 です（D026 の決定3を 403/429 に限って改めるもの。Owner 承認済み）。

**着手前に確認: `specs/fix-manual-facts-generation-cap.md` の PR が main にマージ済みであること。** 同じ `processResearchFactEntry` を触るため、マージ後の main から作業してください。未マージなら着手せず止めてください。

## 何を直すか

Discord の `/調査事実を追加` は、出典 URL が 200 以外だと保存を拒否します（`lib/discord/source-url.ts:63-68`）。ボット拒否のサイト（例: 米国代表の公式サイト `eagles.rugby` が 429）は、実在するページでも入力できません。

403/429 に限り、Owner がモーダルで「目視で確認済み」を選んだときだけ保存できるようにします。**404・その他・タイムアウト・接続失敗は、選んでも拒否のままです。**

## 実装の要点（詳細は spec）

1. `validateSourceUrl` の失敗結果に `status: number | null` を足し、`OWNER_VERIFIABLE_SOURCE_URL_STATUSES`（403, 429）を export します。`reason` の文言は変えません
2. モーダルの `components` の末尾に「出典確認」（`custom_id: "source_check"`、既定 `auto`）を足します。**これで Discord の上限5個に達します**（spec に出典あり）。上限に達したことをコードのコメントに残してください
3. 送信の分岐は spec の表のとおりにしてください。目視確認で保存した行だけ、`metadata` に `source_url_check: "owner_verified"` と `source_url_http_status` を付けます
4. 検査の順序（字数 → URL → 試合の存在）は変えません

## 処理してほしいエッジケース

- `source_check` 未選択（`null`）→ `auto` 扱い
- 想定外の値 → 既存の「入力内容を確認してください。」
- `owner_verified` を選んだが URL が 200 → 通常の保存（2キーを付けない）
- HEAD 405 → GET 403 のフォールバック経由の 403
- 字数エラーの入力では fetch を呼ばない

## 触らないもの

- robots.txt の参照・本文の読み取り（D026 のとおり、どちらもしない）
- 自動取得（`lib/llm/sourced-facts/`）・allowlist・`supabase/`

## 完了の定義

- spec の受け入れ条件 1〜19 をすべて満たす
- 受け入れ条件18の「一時的に壊して落ちることを確認」を実際に行い、結果を PR 本文に書く（確認後は元に戻す）
- `pnpm lint`・`pnpm typecheck`・`pnpm test` が通る
- 変更ファイルは `lib/discord/source-url.ts`・`app/api/discord/interactions/route.ts`・`tests/lib/discord-source-url.test.ts`・`tests/api/discord-interactions.test.ts` の4つを想定しています。これ以外を触る必要が出たら、理由を PR 本文に書いてください

## 参考になる既存パターン

- 検証のテスト: `tests/lib/discord-source-url.test.ts`（fetch をモックして HEAD/GET の応答を返す形）
- モーダルのコンポーネント形式（Label `type: 18` + String Select `type: 3`）: 同ファイルの「確度」欄（`route.ts:180-195`）
