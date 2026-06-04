# リーグワン プレーオフ stage ラベリング修正（3位決定戦が「決勝」と誤表記される）

## 背景

リーグワンの **3位決定戦** プレビュー/レビューが「決勝戦」「チャンピオンシップ」と誤って生成される。

実証（2026-06-04）:
- 決勝 神戸×クボタ（id `0fd7d8e6-...`, `wikipedia_event_id=match_29560`）
- 3位決定戦 サントリー×埼玉（id `96863688-...`, `wikipedia_event_id=match_29559`）
- **両者の `external_ids.round_name` が同一文字列 `"3rd place match/Final"`**。
- `lib/llm/stages/assemble.ts` の `deriveMatchPhase` は `round_name` に `"final"` を含むと `playoff_final` を返す → 両試合が「決勝」扱い。
- 手動 SQL で round_name を分離しても、**同期で `"3rd place match/Final"` に戻る**（恒久化しない）。

### 根本原因（特定済み）
`lib/ingestion/sources/league-one-live.ts`:
- L130: `const title = normalizeWhitespace(card.find(".ttl-wrap .ttl").text());`
- L161-162: `roundName = round === null && isPlayoff ? parsePlayoffStageName(title) : null;`
- L93 `parsePlayoffStageName`: title の `PLAY-OFFS` 以降を stage 名として抜く。

決勝カードと3位決定戦カードが **同じ `.ttl`（"… 3rd place match/Final"）を共有**しているため、`parsePlayoffStageName` が両カードに同一の `"3rd place match/Final"` を返す。2試合は `eventId`（`match_29559` / `match_29560`）と対戦カードで区別できるのに、stage ラベルが潰れている。

## スコープ
対象:
- `league-one-live.ts` の playoff stage ラベリング: 決勝と3位決定戦に**distinct な round_name** を付与する
- 既存 external_ids の backfill（当該2試合を正しい値に・同期で維持されること）
- `deriveMatchPhase`（assemble.ts）に **3位決定戦の専用 phase** を追加
- `generate-preview.ts` / `generate-recap.ts` の `matchPhaseBlock` に 3位決定戦の文言を追加

対象外:
- 他リーグ（URC/Premiership/Top14 等）の stage ラベリング。今回はリーグワンのみ
- 準々決勝・準決勝の文言改善（現状維持）
- フロント UI の変更（文面はパイプライン出力で決まる）

## データモデル変更
マイグレーション不要（`matches.external_ids` は jsonb）。
- `external_ids.round_name` の取り得る値を分離:
  - 決勝 → `"Final"`（または `"決勝"` 等、`deriveMatchPhase` が playoff_final と判定できる値）
  - 3位決定戦 → `deriveMatchPhase` が **playoff_final にならず** 3位決定戦と判定できる値（例 `"3rd place match"` で `"final"` を含まない）
- 当該2試合（`match_29559` / `match_29560`）の backfill。**次回同期でも正しい値が維持される**こと（＝parser 修正が前提）。

## API サーフェス
なし（内部パイプライン・スクレイパのみ）。

## UI サーフェス
間接的: 3位決定戦のプレビュー/レビュー本文が「決勝戦／チャンピオン／タイトル」と書かなくなり、3位決定戦として自然な文脈になる。決勝（神戸×クボタ）の文面は従来どおり「決勝戦」で正しい（リグレッションさせない）。

## LLM 連携
パイプライン段階: assemble（phase 導出）→ generate-preview / generate-recap（phase ヒント文）。
- `lib/llm/types.ts` `MatchPhase` に 3位決定戦用の値を追加（例 `"playoff_third_place"`）。
- `assemble.ts deriveMatchPhase`: round_name が 3位決定戦（"3rd place" / "bronze" 等、"final" を含むケースも `"3rd place"` を優先判定）なら新 phase を返す。**順序に注意**: 現状 `includes("final")` が先に当たるので、3位決定戦判定を **final 判定より前**に置く。
- `generate-preview.ts` L62-84 `matchPhaseBlock` / `generate-recap.ts` L169-205 に新 phase の分岐を追加:
  - 例: 「この試合は**3位決定戦**です。決勝ではありません。3位（ブロンズ）を懸けた一戦として描写し、『決勝』『チャンピオン』『優勝』『タイトル』という表現を使わないこと。」
- プロンプトに渡す assembled JSON（preview L108）に round_name が含まれていても矛盾しないこと。

## 受け入れ条件
1. `league-one-live` 相当のユニットテスト: 決勝カードと3位決定戦カードを含む HTML（fixture）から、**2試合が distinct な round_name** を持つ（決勝≠3位決定戦）。
2. `deriveMatchPhase`:
   - `round_name="3rd place match"` → 新 phase（playoff_final ではない）
   - `round_name="Final"` → `playoff_final`
   - 既存ケース（"semi"→playoff_semifinal / 数値 round→league）にリグレッションなし
3. 同期（league-one ingest）を実行後、`match_29559`（3位決定戦）の round_name が **"final" を含まない値**で維持される。
4. 3位決定戦（`96863688-...`）の preview・recap を ja+en で再生成 → 本文に「決勝」「チャンピオン」「優勝」「タイトル」が現れない。決勝（`0fd7d8e6-...`）は従来どおり「決勝戦」と書く。
5. `pnpm test`・`pnpm tsc --noEmit` green。

## 未解決の質問（Codex 着手前に確認）
1. **決勝/3位決定戦を分けるシグナル**: league-one.jp のスケジュールカード（`.ttl-wrap .ttl`）で、両試合が本当に同一 `.ttl` を共有しているか、それとも各カードに個別ラベルがあるか、**実 HTML を確認**して決める。候補:
   - (a) 各 match 詳細ページ（`/en/match/{id}`）の stage ラベルを引く
   - (b) カードの並び順（通常 3位決定戦が先・決勝が後）＋スコア/対戦から推定
   - (c) `wikipedia_event_id` の既知マッピングで補正（最小・限定的）
   - 推奨は (a) か、`.ttl` 内の `/` 区切りを試合ごとに割り当てる構造的判定。順序依存(b) は脆いので単独では避ける。
2. backfill を**専用スクリプト**で当該2試合に当てるか、parser 修正＋通常同期の再実行で自然に直すか（同期で直るなら追加スクリプト不要が理想）。
3. 新 `MatchPhase` 値の命名（`playoff_third_place` で良いか）。
