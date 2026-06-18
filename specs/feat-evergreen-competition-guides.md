# feat-evergreen-competition-guides

## 背景

集客の壁打ち（2026-06-18・GA4/GSC 実測ベース）の結論:
- ゼロ起点の organic X/note は効果が実証されず（Referral 3=全バウンス、Social 2）
- カタカナ命名（[[feat-japanese-team-competition-names]] / PR #395）は実装・本番稼働済みだが、**ドメイン権威ゼロ**でヘッド語（「スーパーラグビー」等）は当面勝てない
- 勝ち筋は **B'：エバーグリーンな実用ページで、高インテント・低競合の日本語クエリを捕捉し、被リンク/ブックマークも得る**

現状調査で2つの穴が判明:
1. **順位表＝表示は既にある**（`app/c/[competition]/[season]/page.tsx` に `StandingsTable` ＋ `#standings`、`getStandingsForCompetition`、メタにも「順位表」）。しかし `competition_standings` が**全大会0行**。既存 [[p1-competition-standings]] は **Six Nations 2027 専用**（LLM 文脈用）に作られ、ライブ大会は未取り込み。→ **取り込みを通すだけ**で「○○ 順位表」クエリの受け皿が完成
2. **視聴方法＝完全欠落**。「プレミアシップ 視聴 日本」「スーパーラグビー 配信」等の高インテント・無競合クエリの受け皿が空席（先行者 note「てぃーちゃー」は1年休眠＝市場の穴）

## スコープ

**Part A（速攻・データ）— ライブ大会の順位表取り込み**
- 既存資産（`lib/scrapers/wikipedia-standings.ts` / `lib/ingestion/standings.ts` / `StandingsTable` / `getStandingsForCompetition`）を再利用し、**進行中・直近シーズンの主要大会**（super-rugby-pacific / premiership / urc / top-14 / league-one / rugby-championship / six-nations / pnc / autumn-nations）の順位表を `competition_standings` に取り込む
- 取り込みを `ingest-live-competitions` 等のライブ経路、またはバックフィルスクリプトに配線（冪等）
- なぜ現在空かを確認の上で配線（p1 は SN2027 fixtures 末尾でのみ呼んでいる）

**Part B（本命・コンテンツ）— 視聴方法エバーグリーン section**
- `competitions` に `viewing_guide_ja text null`（markdown）カラム追加。Owner が大会ごとに「日本での視聴方法」を記述（DAZN / J SPORTS / WOWOW / 視聴手段なし 等）
- `/c/[competition]` と `/c/[competition]/[season]` に「日本での視聴方法」section を追加（`viewing_guide_ja` があれば表示、無ければ非表示）
- SEO: 各大会ページの title/description に「順位表・日程・視聴方法」の語を含める。構造化データは維持

対象外:
- 新デザインシステム・大規模UI改修
- 過去全年度の標準 standings 一括取り込み（直近シーズン優先）
- 視聴方法の管理 GUI（編集は直 SQL か簡易で可。正確性・更新責任は Owner）
- 放送権データの自動取得（編集コンテンツとして手動運用）

## データモデル変更
- `competition_standings`: 既存テーブルにライブ大会ぶんを populate（スキーマ変更なし）
- `competitions.viewing_guide_ja text null` を追加（マイグレーション）。`pnpm supabase:types` 再生成

## API / UI サーフェス
- `/c/[competition]/[season]`：`#standings` が実データで表示。「日本での視聴方法」section 追加
- `/c/[competition]`：視聴方法 section 追加（シーズン横断の常設情報として）
- メタデータ：title 例「URC 2025-26 順位表・試合結果・日本語レビュー｜Tryline」、description に視聴方法を含める

## 受け入れ条件
1. Part A: 進行中・直近シーズンの主要大会で `competition_standings` に行が入り、シーズンページ `#standings` にテーブルが表示される（例: URC 2025-26 の順位表が出る）
2. 取り込みは冪等（再実行で重複しない。upsert）。ソースは Wikipedia（`fetchWithPolicy`・robots 準拠）
3. Part B: `viewing_guide_ja` がある大会で「日本での視聴方法」section が表示、無い大会では非表示で崩れない
4. 各大会ページの title/description に「順位表」「視聴方法」の語が含まれる（GSC で当該クエリの受け皿になる）
5. 既存の試合結果/recap リンク・構造化データが回帰しない
6. lint / typecheck / test 緑

## 未解決の質問
1. 視聴方法の内容は Owner が記述（放送権は変わる・正確性重要）。編集を直 SQL とするか、最小の管理導線を作るか
2. standings 取り込みの鮮度（cron 頻度）。レギュラーシーズン終了後は更新不要なので、ライブ経路に相乗りで十分か
3. Part A を先行リリース（速攻の SEO 受け皿）→ Part B を続けて、の段階リリースで良いか
