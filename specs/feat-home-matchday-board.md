# ホームに Matchday board と注目大会カードを追加する

## 背景

2026-07-08 の集客・デザインレビューで、ホームのファーストビューが「雰囲気は良いが、初見ユーザーに『今日ここで何が見られるか』が伝わらない」ことが課題として確定した。note / X / 検索から着地した初見ユーザーへの回答（今週の試合・日本時間・レビュー有無）がスクロールしないと現れない。

Owner 決定（2026-07-08、AskUserQuestion）: ホームは**「今週の試合」と「最近のレビュー」の両方を役割分担で持つ**。

- 上部 = 今週（ヒーロー右の Matchday board + 直下の「今週の試合」帯）が「訪問理由」を担う
- 下部 = 最近のレビュー（PR #497 の大会別ヒーロー + コンパクト行）が「資産・課金導線」を担う
- 試合がない週は Matchday board を出さず、レビューが実質的に繰り上がる

デザインの基準モック: `docs/design/mock-growth-home-calendar.html`（Owner 承認済み、2026-07-08）。ただしモックの以下の点は**採用しない**:

- PNC カードの「5 GSCクリック / 10.3 平均順位 / 142 表示回数」等の**内部指標をユーザー向け UI に出すこと**（モック作成時にレビューの根拠数字が混入したもの。ユーザー価値のある数字に差し替える。下記 UI サーフェス参照）
- 「検索流入が最も立ち上がっている大会」「順位表検索でクリック圏内」「中長期で育てる検索資産」等の**社内向け SEO 文言**
- 下部の Six Nations / RWC 2027 ハブカード 2 枚組（マージ済みの大会アーカイブチップ（PR #489）と機能重複するため今回は見送り。未解決の質問に記載）

現行デザインの踏襲事項（Owner 指定）:

- **チームカラーグラデーション**: `components/match-card.tsx:36` の `getTeamColor(slug)` による home/away 2 色グラデーションのパターンを Matchday board の注目試合にも使う
- **国旗・チームバッジ**: `components/team-badge.tsx` / `components/flag-icon.tsx` をそのまま使う（モックのテキストのみ表記にはしない）
- 紙テクスチャ背景（PR #493）・bento カード（PR #489）・明朝見出しの現行トーンを維持する

補足（過去の UI 判断との整合）: ヒーロー右側には過去に装飾 SVG（ラグビーボールのワイヤーフレーム）があり、「情報価値がない」ため削除された経緯がある（commit 536e2c8、2026-05-18）。今回追加する Matchday board は試合情報を持つ機能要素であり、この判断と矛盾しない。

関連 spec: `feat-calendar-week-navigation.md`（**前提 spec**。状態ピル分解 `hasPreview`/`hasRecap` と注目試合選定ユーティリティは同 spec で実装される）、`feat-home-multi-competition-featured-reviews.md`（PR #497・進行中。「最近のレビュー」セクションは本 spec では触らない）。

## スコープ

対象:

1. ヒーローを 2 カラム化し、右に Matchday board（今週の注目試合 + クイックリスト）を追加。ヒーロー内の無料サンプルカードは Matchday board に置き換え（サンプル導線は既存のサンプルセクション `app/page.tsx:270-330` に残る）
2. ヒーローコピーの変更（h1 とリード文）
3. 「今週の試合」帯（`app/page.tsx:364-387`）のヘッダーを見出し大型化 + カレンダーへの導線強化
4. 注目大会カード（PNC 2026 推し）を「今週の試合」帯の横に追加
5. 既存サンプルセクション（`app/page.tsx:270-330`）にチャット質問例ボックスを追加

対象外:

- 「最近のレビュー」セクション（PR #497 が進行中。**本 spec の実装は PR #497 マージ後にリベースして着手すること**）
- 「大会アーカイブ」「最近レビューのある大会」セクション（PR #489 のまま）
- `/calendar` ページ（`feat-calendar-week-navigation.md` が担当）
- メール登録フォーム
- モック下部の Six Nations / RWC 2027 ハブカード
- ヒーロー背景画像・HeroTexture の変更（現状維持）

## データモデル変更

なし。

## API サーフェス

新規ルートなし。`app/page.tsx`（RSC）でのデータ取得の変更のみ:

- Matchday board 用: 既存の `homepageWeekMatches`（`getMatchesInRange` の今週分）を再利用する。**追加のクエリを増やさない**
- 注目試合の選定: `feat-calendar-week-navigation.md` で共通化される選定ユーティリティ（日本代表優先 → レベルスコア）を使う
- 注目大会カード用: 対象大会を定数で指定する。`lib/` 配下に設定を置く:

```
// lib/featured-competition.ts（新規、値は例）
export const FEATURED_COMPETITION = {
  family: "pnc",
  season: "2026",
  headline: "PNC 2026 を追う",
  description: "日程・順位・結果・日本代表の次戦をひとつのページで。",
} as const;
```

カードの統計 3 枠は DB から導出する（内部指標は使わない）: 「次戦日時（JST）」「公開済みレビュー数」「今週の試合数」。いずれも既存クエリ（`getMatchesInRange` / published recap の count）で取得できる範囲とし、新規クエリを追加する場合は 1 本にまとめる。

## UI サーフェス

### 1. ヒーロー 2 カラム + Matchday board（`app/page.tsx:175-264`）

- `lg` 以上: `grid-template-columns: minmax(0,1fr) 420px` 相当の 2 カラム。左=コピー+CTA、右=Matchday board。`lg` 未満: 縦積み（board はコピーの下）
- Matchday board の構成（モック `.matchday-panel` 参照）:
  - ヘッダー: 「MATCHDAY BOARD」ラベル + 週表記（例「7月第2週」）
  - 注目試合 1 件: 大会名ピル、`TeamBadge` + チーム名（ホーム/アウェイ）、中央に vs サークル。カード背景に `getTeamColor` の home/away 対角グラデーション（`match-card.tsx:36` の低透過パターンを踏襲）
  - メトリクス 3 枠: キックオフ JST 時刻 / 順位情報（`competition_standings` にあれば「◯位」、なければ `world_ranking`「世界◯位」、どちらも無ければ枠ごと非表示で 2 枠）/ コンテンツ状態（「プレビュー公開」or「レビュー公開」or「試合前」）
  - クイックリスト: 注目試合以外の今週の試合を最大 3 件（キックオフ JST + 対戦カード + 状態ピル）。4 件以上ある週は「ほか◯試合 →」リンクで `/calendar` へ
- **今週の試合が 0 件のとき board 全体を描画しない**。ヒーローは単カラムに戻る（条件分岐のみ、別レイアウトを作らない）
- board 内の試合はすべて `/matches/[id]` へのリンク

### 2. ヒーローコピー

- h1: 「今週の海外ラグビーを、日本時間で追う。」
- 改行制御: 現行の `break-keep` を維持し、`<br className="hidden sm:block" />` を「今週の海外ラグビーを、／日本時間で追う。」の位置に置く。**モバイルで「ラグビ／ー」のような語中改行が起きないこと**（`wbr` か手動改行で制御）
- リード文: 「PNC、Six Nations、Premiership、URC。週末に重なる試合を、日程・結果・順位・日本語レビューまでひとつの流れで確認できます。」
- CTA は現状維持（Premium 訴求 + 「今週の試合を見る」→ `/calendar`）。analytics の `cta_id` / `cta_location` は**変更しない**（計測の連続性）
- ヒーロー内の無料サンプルカード（`home_hero_sample_recap`、`app/page.tsx:227-263`）は削除する。サンプル導線はサンプルセクション（`home_sample_section_sample_recap`）に一本化

### 3. 「今週の試合」帯のヘッダー（`app/page.tsx:364-387`）

- 見出しを現行の極小 uppercase から明朝 `h2`（`font-serif text-2xl` 以上）に格上げし、サブテキスト「全大会横断・JST 表示」を添える
- 右上の「今週をすべて見る →」は `/calendar` への導線として維持（文言は「前週・翌週もカレンダーで →」に変更可）
- リスト本体は共有 `WeekSchedule compact` のまま（ピル分解は前提 spec で入る）

### 4. 注目大会カード

- `lg` 以上で「今週の試合」帯の右カラム（モック `.focus-card` 参照）、`lg` 未満では帯の下に配置
- ダーク背景（`--color-ink`）+ 上部に大会キービジュアル `public/visuals/pnc.jpg`（既存 visuals の流用。新規画像なし）
- 見出し・説明文は `FEATURED_COMPETITION` 定数から。リンクは `/c/pnc/2026`
- 統計 3 枠は API サーフェス記載の 3 つ（内部指標禁止）
- `TrackedLink` で計測: `cta_id: "home_featured_competition"`, `cta_location: "home_week_section"`

### 5. チャット質問例ボックス

- 既存サンプルセクション（`app/page.tsx:270-330`）内に「ASK AFTER MATCH」ボックスを追加（モック `.sample-box` 参照）
- 静的な質問例 3 つをそのまま表示: 「勝敗を分けた場面はどこ？」「日本代表の次戦にどう影響する？」「この選手はどんなタイプ？」
- LLM 呼び出しは**しない**（静的コピーのみ）。既存 CTA の analytics id は変更しない

## LLM 連携

なし（チャット質問例は静的コピー。LLM コスト増ゼロ）。

## 受け入れ条件

1. 今週に試合が 1 件以上ある状態でホームを表示すると、ヒーロー右（`lg` 以上）に Matchday board が描画され、注目試合 1 件とクイックリスト最大 3 件が表示される
2. 今週の試合が 0 件のとき、Matchday board が DOM に存在せず、ヒーローが単カラムで表示される（ビルド・表示エラーなし）
3. 注目試合の選定が `feat-calendar-week-navigation.md` の共通ユーティリティ経由である（ロジックの複製がない）
4. Matchday board の注目試合カード背景に home/away 両チームの `getTeamColor` 由来グラデーションが適用され、チーム名の横に `TeamBadge` が表示される
5. 順位・ランキングデータが無い試合でも board がエラーなく描画される（メトリクス枠が 2 枠に減るのみ）
6. ホームの HTML に「GSC」「クリック」「平均順位」「表示回数」等の内部指標文言が含まれない
7. h1 が「今週の海外ラグビーを、日本時間で追う。」で、375px 幅で語中改行（「ラグビ」+「ー」の分離等）が発生しない
8. ヒーロー内の旧サンプルカード（`cta_id: home_hero_sample_recap`）が存在せず、サンプルセクションの既存 CTA（`home_sample_section_*`）は id 変更なく残っている
9. 注目大会カードが `/c/pnc/2026` にリンクし、統計 3 枠が DB 由来の値（次戦・レビュー数・今週の試合数）である
10. `tests/app/home-page.test.tsx` を新構成（board の有無分岐・ヒーローコピー・サンプルカード削除）に合わせて更新し、`pnpm test` が通る
11. `pnpm build` が通る
12. 320 / 375 / 768 / 1440px でレイアウト崩れ・横スクロールが発生しない（スクリーンショットで確認）

## 未解決の質問

- モック下部の Six Nations / RWC 2027 ハブカード 2 枚組: 大会アーカイブチップ（PR #489）との統合・差別化をどうするか。`feat-bento-card-redesign.md` の未解決の質問（「最近レビューのある大会」との統合）と合わせて別途判断
- `FEATURED_COMPETITION` の切り替え運用: PNC 2026 終了後に手動で定数を書き換える想定でよいか。自動判定（進行中大会から選ぶ）は YAGNI として見送った
- ヒーローの Premium CTA 文言「7日間無料でレビュー全文を読む」を維持したが、新コピーとの整合で「無料レビューを読む」（モック文言）に寄せるかは Owner 判断
