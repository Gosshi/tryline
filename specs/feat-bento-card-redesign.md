# カードパターンの横断的差別化（案B: 非対称モジュール）

## 背景

Taste Skill監査（2026-07-06）で、ホームページ・カレンダーページ・料金ページの各カード/リストが「白背景＋薄いボーダー＋均一角丸12px＋余白」という同一パターンの使い回しで、ページが変わっても視覚的な手がかりがないことが判明した。

3方向のモックアップ（`docs/design/mock-cards-{a,b,c}.html`）を作成し、Owner が**案B「非対称モジュール」**を選定（2026-07-06決定）。直近1件を大きなヒーロー扱いにし、残りは密度の高いコンパクト行に落とす。均等なグリッド/リストを避け、要素間に優先順位の差をつける。

基準モック: `docs/design/mock-cards-b-bento.html`

サイト全体の画像・ビジュアル監査（2026-07-07、`specs/feat-team-player-visual-identity.md` 等）とは独立したトラック。本specはレイアウト・情報設計の変更のみで、新規画像は使わない（大会アーカイブの背景色は既存の `getCompetitionFamilyColor` を使う。生成済みの大会キービジュアル `public/visuals/{family}.jpg` は写真素材でチップサイズには不向きなため、本specでは使わない。将来的な検討課題として未解決の質問に記載）。

## スコープ

対象（4箇所、すべて案Bの「直近1件を主役化＋残りはコンパクト」という思想を適用）:

1. `app/page.tsx:450-503`（ホーム「最近のレビュー」セクション）
2. `app/page.tsx:539-586`（ホーム「大会アーカイブ」セクション。横スクロールの不均等チップに変更）
3. `components/calendar/week-schedule.tsx`（共有コンポーネント。ホーム「今週の試合」`app/page.tsx:381-386` と `/calendar` ページ `app/calendar/page.tsx:50-53` の両方に影響する）
4. `app/pricing/page.tsx:320-339`（料金ページFAQ。1件目を大きく強調、残りをアコーディオン化）

対象外:
- `app/page.tsx:505-537`（「最近レビューのある大会」セクション）— 大会アーカイブと視覚的に類似した機能のため、大会アーカイブ側の変更結果を見てから統合/差別化を再検討する。本specでは現状の白カードのまま変更しない
- 大会別の生成画像（`public/visuals/{family}.jpg`）をチップ背景に使うこと（未解決の質問に記載）
- 試合詳細ページ・チーム/選手ページ（別spec `feat-team-player-visual-identity.md` 等の対象）
- `app/pricing/page.tsx` の比較表・レビューサンプル画像セクション（FAQセクションのみが対象）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 1. ホーム「最近のレビュー」

`recentReviews`（`app/page.tsx:450-503`）の先頭1件を大きなヒーローカードにする。チームカラーグラデーション背景（`match-card.tsx` の `getTeamColor` 由来のグラデーションを参考に、home/away 2色の対角グラデーション）、大会名タグ、チーム名、スコアを大きく表示。残り（2件目以降）は罫線区切りの薄い行に格下げ（現行の `rounded-xl border` カードより軽い表現。`components/team-players-section.tsx` のような罫線ベースでもよい）。

参考: `docs/design/mock-cards-b-bento.html` の `.review-hero` / `.review-compact` セクション。

### 2. ホーム「大会アーカイブ」

`homepageCompetitionLinks`（`app/page.tsx:539-586`）を現行の `grid gap-3 sm:grid-cols-2` から横スクロールの不均等チップ列に変更する。

- 進行中/直近の大会（現状のデータで判別できる基準がなければ、配列の先頭1件、または大会シーズンの最新性で判定。判定ロジックが自明でない場合は末尾の質問に記載）を幅広チップ（`lg`）、他を通常幅チップ（`md`）にする
- チップの背景色は `getCompetitionFamilyColor(family)` を使う（新規画像は使わない）
- `overflow-x-auto` の横スクロールコンテナにする。スクロールバーは非表示にしてよい（`scrollbar-width: none` 等）
- 大会ロゴ（`getCompetitionLogoSrc`）は白抜きのバッジとしてチップ内に残す

参考: `docs/design/mock-cards-b-bento.html` の `.comp-scroll` / `.comp-chip` セクション。

### 3. `components/calendar/week-schedule.tsx`（共有コンポーネント）

現行の「日付見出しテキスト＋リスト」を、日付を大きな縦ブロック（曜日＋日付の数字）にして、試合行と横並びの非対称レイアウトに変更する。

- `groupMatchesByJstDay` のグルーピングロジックは変更しない
- 各 `DayGroup` の描画を、左に固定幅の日付ブロック（背景色 `var(--color-ink)` 等、曜日+日付数字）、右に試合行を縦に並べる `flex` レイアウトに変更する
- `compact` プロパティ（ホームの「今週の試合」用）と非compact（`/calendar` ページ用）の両方で成立するデザインにすること。`compact` 時は日付ブロックを一回り小さくしてよい
- `MatchRow` 自体の情報（大会名・チーム名・スコア/時刻・ステータスバッジ・「解説」バッジ）は変更しない。行の見た目（罫線区切りにするか等）は裁量でよい

参考: `docs/design/mock-cards-b-bento.html` の `.cal-block` / `.cal-date-col` / `.cal-rows` セクション。

### 4. `app/pricing/page.tsx` FAQ

現行の `faqs.map` による均一な `rounded-xl border` カード羅列を、新規クライアントコンポーネント `components/pricing-faq.tsx` に切り出し、以下の構成にする。

- 1件目（`faqs[0]`、「無料トライアルはありますか？」）を常に展開した「ヒーローFAQ」として大きく表示（Q+Aとも表示）
- 2件目以降はアコーディオン形式（質問のみ表示、クリックで展開/折りたたみ）
- アコーディオンの開閉状態管理のため `"use client"` が必要。`app/pricing/page.tsx` 自体はサーバーコンポーネントのまま維持し、`faqs` 配列を props で渡す

参考: `docs/design/mock-cards-b-bento.html` の `.faq-hero` / `.faq-list` セクション。

## LLM 連携

なし

## 受け入れ条件

1. ホーム「最近のレビュー」で、先頭1件が大きなヒーロー表現（チームカラーグラデーション背景・大きめの文字）で表示され、残りは軽量な行表示になる
2. ホーム「大会アーカイブ」が横スクロールの不均等チップ列になり、`getCompetitionFamilyColor` の色とロゴが表示される
3. `components/calendar/week-schedule.tsx` の変更後、ホーム「今週の試合」（`compact`）と `/calendar` ページ（非`compact`）の両方で、日付が大きな縦ブロックとして表示され、崩れない
4. `/pricing` のFAQで、1件目が常時展開のヒーロー表示、2件目以降がクリックで開閉するアコーディオンになる。キーボード操作（Tab+Enter/Space）で開閉できる（アクセシビリティ）
5. 「最近レビューのある大会」セクション（対象外）に変更がない
6. 既存のリンク遷移（試合詳細・大会ハブ・カレンダー）が壊れていない
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
8. 320/768/1024/1440pxの主要ブレークポイントで崩れないことをスクリーンショットで確認する

## 未解決の質問

- 大会アーカイブのチップで「どれを幅広(lg)にするか」の判定基準（進行中シーズン、最新更新順など）は具体的なデータ基準が仕様書側で確定していない。Codex着手前にOwnerが基準を指定するか、「配列の先頭1件を幅広にする」という単純な仮基準で進めてよいか確認すること
- 大会別の生成画像（`public/visuals/{family}.jpg`、9/10大会分が既に生成済み）をチップ背景に使うかどうかは本specでは見送った。写真素材は小さいチップには重すぎる可能性があるため、まず本spec（フラットカラー＋ロゴ）で運用し、視覚的に物足りなければ別specで画像導入を検討する
