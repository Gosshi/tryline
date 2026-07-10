# 大会ガイドの事実誤りを修正し、放送情報に出典・検証日を必須化する

## 背景

2026-07-10、Codex（新モデル）による集客・デザイン分析で「信頼上の緊急課題」として指摘された。

本番DB実測: `competition_guides` テーブルの11件全てが2026-06-25の同一バッチで生成されており、`verified_at`（検証日時）や `source_url`（出典）を持つカラムが存在しない。

具体的な事実誤りを確認済み: `family='rwc'` の `guide_ja` に「参加チームは20カ国」とあるが、RWC 2027（2027年開催、公式発表済み）は**24チーム・52試合**が正しい（現行の20チーム形式は旧大会のもの）。本番公開ページ（`https://www.trylinerugby.com/c/rwc`）でも実際に「20カ国」の表示を確認済み。

また全11大会ガイド（`six-nations`・`premiership`・`urc`・`top-14`・`super-rugby-pacific`・`rugby-championship`・`nations-championship`・`rwc`・`autumn-nations`・`pnc`・`league-one`）が、DAZN・WOWOW・J SPORTS・「独占」「全試合」等の放送関連の記述を含んでいるが、いつ・どのソースを確認して書かれたものかを示す情報が一切ない。放送権は契約更新のたびに変わりうるため、断定的な表現を検証なしで公開し続けるのはリスクが高い。

## スコープ

対象:
- `competition_guides` テーブルに `verified_at`（timestamp, nullable）・`source_url`（text, nullable）カラムを追加する
- RWC 2027の参加チーム数・試合数の事実誤り（「20カ国」→「24チーム・52試合」）を修正する。修正時は公式ソース（`rugbyworldcup.com` 等）を確認し、`verified_at`・`source_url` を設定する
- 放送情報（DAZN・WOWOW・J SPORTS等の言及）を含む記述について、`verified_at` が設定されていない場合はUI上で断定的な表現（「独占」「全試合」等）を避け、確認日時が無いことが分かる形にする、または該当箇所を一時的に非表示にする（実装方針はCodexの判断に委ねるが、「未検証の断定表現を出し続けない」という原則は必須）
- ガイドページUIに、`verified_at` があれば「最終確認日: YYYY-MM-DD」を表示する

対象外:
- 11大会ガイド全ての放送情報を今回のspecで実際に再検証・再取材すること（出典確認自体はOwnerが別途行う。本specはデータモデル・表示の仕組み作りと、RWCの参加チーム数という確認済みの事実誤り修正まで）
- 大会ガイドの定期更新の自動化・cron化（別specの候補）

## データモデル変更

`competition_guides` テーブルに以下のカラムを追加:
- `verified_at` (timestamp with time zone, nullable)
- `source_url` (text, nullable)

マイグレーションファイルを `supabase/migrations/` に追加する。

## API サーフェス

なし（既存の `getCompetitionGuide` 等のクエリ関数が新カラムも返すよう更新）。

## UI サーフェス

- 大会ガイド表示コンポーネント（`components/competition-viewing-guide.tsx` 想定）に、`verified_at` があれば「最終確認日: YYYY-MM-DD」の表示を追加
- `verified_at` が無い放送情報の断定的表現は、実装時にCodexが具体的な表示方針を決めてよい（例: 「確認中」の注記を添える、該当文をガイド生成プロンプトから一時的に除外する等）。迷う場合は完了報告で質問として提示する

## LLM 連携

なし（本spec自体はガイド本文の一括再生成を行わない。RWCの事実誤り修正は手動更新でよい）。

## 受け入れ条件

1. `competition_guides` テーブルに `verified_at`・`source_url` カラムが追加されている
2. `family='rwc'` の `guide_ja` から「20カ国」の記述が除去され、正しい参加チーム数（24チーム）・試合数（52試合）に修正されている。修正時に確認した公式ソースURLが `source_url` に設定され、`verified_at` が設定されている
3. 大会ガイドページに `verified_at` があれば「最終確認日」が表示される
4. 未検証（`verified_at` が null）の放送情報について、断定的な表現を出し続けない対応がされている（具体的な実装方法は完了報告に明記する）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番DBへのマイグレーション適用・RWCガイド本文の実際の更新はOwner承認後に別途実施する。本spec自体はコード実装・マイグレーションファイル作成・ローカル確認までで完了とする

## 未解決の質問

- 未検証の放送情報の具体的な扱い（注記表示か非表示か）はCodexの実装時判断に委ねる。迷う場合は完了報告で質問として提示する
- 他10大会の放送情報の実際の出典確認・修正は本spec範囲外。Owner側で別途確認してから、同じ仕組み（`verified_at`/`source_url`設定）を使って更新する想定
