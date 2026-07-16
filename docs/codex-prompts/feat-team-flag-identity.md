# Codex プロンプト: feat-team-flag-identity

2 リポジトリ構成。**プロンプト A（tryline）→ マージ・マイグレーション適用 → プロンプト B（tryline-mobile）**。フィールドが実データに依存するため今回は**直列必須**（並行不可）。

---

## プロンプト A（tryline リポジトリで貼る）

`/specs/feat-team-flag-identity.md` の「tryline 側」を実装してください: `teams.flag_code` カラム、バックフィル（自動導出＋GBR19件の手動マッピング）、BFF フィールド追加。

コンテキスト:
- `AGENTS.md` を読む
- 対象クエリは `lib/db/queries/matches.ts` 等、`V1TeamSummary` を組み立てている箇所全て（`grep -rn "V1TeamSummary" lib` で洗う）
- マイグレーション・バックフィルは1本のSQLで完結させてよい。GBR19件のマッピングは仕様書の表をそのまま使う
- `country` から alpha-2 への変換は、既存の `country` 値の実際の分布を `select distinct country from teams` で確認してから対応表を作る（仕様書に列挙されていない国コードが含まれる可能性がある）

エッジケース:
- `country` が null のチーム（存在すれば）は `flag_code` も null のまま
- England/Wales/Scotland は Unicode Tag Sequence の地域旗絵文字（🏴󠁧󠁢󠁥󠁮󠁧󠁿 / 🏴󠁧󠁢󠁷󠁬󠁳󠁿 / 🏴󠁧󠁢󠁳󠁣󠁴󠁿）をそのまま `flag_code` に格納する（仕様書に確定済み。Owner 承認 2026-07-16）

完了の定義: 受け入れ条件 1〜4 のテスト、`pnpm test`・`pnpm build` pass。**マイグレーション適用は Owner が行う**。

---

## プロンプト B（tryline-mobile リポジトリで貼る。A の本番反映後）

`docs/specs/feat-team-flag-identity.md`（コピー設置済み）の「tryline-mobile 側」を実装してください。サーバー側は本番稼働済みです。

コンテキスト:
- `AGENTS.md` を読む
- `src/api/types.ts` を `reference/api-types.ts`（同期済み）で更新
- 対戦表示コンポーネントは `src/components/MatchCard.tsx`・`src/matches/MatchDetailScreen.tsx`（`feat-mobile-editorial-polish` で作ったマストヘッド帯を維持したまま対戦部分のみ差し替え）

エッジケース:
- `flag_code` が null → 国旗を省略しコードのみ（レイアウト崩れなし）
- 絵文字国旗（🏴系の地域旗を含む）が実機で表示崩れする場合は Owner に報告する
- フルネームの2行折返し時もマストヘッドの帯の高さが変わらないこと（`feat-mobile-audit-bugs` で直した折返し対策と両立させる）

完了の定義: 受け入れ条件 5〜9 のテスト、CI green、実データでのスクリーンショット（受け入れ条件10の Owner 目視用、特に UK 系クラブの国旗正確性が分かるカット）を PR に添付。
