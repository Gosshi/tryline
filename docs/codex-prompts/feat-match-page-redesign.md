# Codex プロンプト — 試合ページ ビジュアル刷新（やわらかモダン）

仕様: `specs/feat-match-page-redesign.md` を読んでから着手すること。基準ビジュアルは `docs/design/mock-1-soft-v3.html`（412px 幅・A レイアウト）。要点と注意のみ記す。仕様本文は繰り返さない。

## 大方針

- **既存コンポーネントの再スタイル**。新規ページ・新規データ層は作らない。
- **DB スキーマ変更・新マイグレーション・新規クエリは禁止**（ゼロ）。既存クエリを流用。
- **パイプライン変更は「引用指示のプロンプト 1 行」のみ**。それ以外の `lib/llm/*` には触れない。
- 捏造ガード厳守: **events に無い局面語（ラインアウト/モール/スクラム等）・「分岐点」等の断定を UI ラベルや本文で新造しない**。

## やること（確定事項を反映済み）

1. **デザイントークン = A案（サイト全体刷新）** … `app/globals.css`
   - 既存 shadcn HSL トークン（`--background` / `--foreground` / `--card` / `--primary` / `--muted` / `--border` / `--radius` 等）を、`docs/design/mock-1-soft-v3.html` の `:root` に合わせて**書き換える**。
   - チーム色（`--team-home` / `--team-away` 相当、データ駆動）・影 2 段・数字フォント等を**追加**。書体は本文 Zen Maru Gothic、数字 Outfit（`tabular-nums`）。
   - 既存のトークン整備プロンプト（`p2-design-tokens.md` / `frontend-typography-system.md`）の構造に倣う。**サイト全体に波及する前提**。
2. **スコアヒーロー** … `components/match-header.tsx`
   - チーム色グラデ背景＋暗オーバーレイ、大型スコア、勝者に WIN バッジ、日時/会場/ステータスのチップ。
   - チーム色解決は**既存実装を流用**（現行 match-header のグラデ／`p2-ui-match-header-gradient.md`・`frontend-hero-and-team-colors.md` 由来のチームカラー）。色未設定チームはニュートラルのフォールバック。
   - 状態: 試合前=日時/会場（スコア無し）、LIVE=ライブスコア＋LIVE バッジ、終了=確定スコア＋WIN バッジ。
3. **見出しカード＋本文** … `components/match-content-section.tsx` / `components/match-content.tsx`
   - 見出しカード: タイトル＋リード＋バイライン（編集部・読了目安・ピル「プレビュー」|「レビュー」）。
   - 本文: Markdown の `blockquote` を引用ブロック（モック `.pull`＝薄赤強調）としてスタイル。`rehype-raw` 不使用・XSS 防止維持（`fix-markdown-renderer.md` の方針踏襲）。
   - 「続きを読む」を使う場合も**全文を初期 DOM に残す**（折りたたみは CSS/詳細表示で、HTML には全文）。
   - 未公開時は既存 `ContentPlaceholder` ＋ `deriveContentState`（`p1-match-content-display`）を踏襲。
   - **試合終了後もプレビューは消さない**: recap の下に **折りたたみ（`<details>`・既定閉じ）「試合前のプレビューを表示」** で残す。全文は初期 DOM に出す。`<meta description>`／構造化データの主ソースは**レビュー優先**を維持（終了後にプレビューが上書きしないこと）。現状の `match.status !== "finished"` 出し分けに、終了時はプレビューを折りたたみで再掲する分岐を足す。
4. **要点（キーモーメント）** … `components/match-events-section.tsx`
   - 主役 1（キーモーメント）＋小チップ 2。**`match_events` 由来の得点事実のみ**。
   - 主役は **lead-clinching score の決定的導出関数**で選ぶ（UI 側、`match-events` クエリ結果に対する純関数、**単体テスト必須**）。ルール/エッジケースは仕様「要点キーモーメントの主役選定」を厳守。
   - ラベルは中立（「リードを広げた得点」等）。「勝敗を分けた瞬間」「分岐点」は使わない。
   - **events 空 → 要点ブロック非表示**。**ランニングスコアが最終スコアと不一致 → 主役カード非表示**（整合ゲート）。
   - **プレビュー時は要点ブロックを非表示**（戦術ポイントは公開データ未保存＝「新規クエリ禁止」と両立不可のため）。要点は recap のみ events 由来で表示。
5. **順位への影響** … `components/standings-table.tsx`：当該試合の 2 チームをアクセント色でハイライト。
6. **得点グラフ** … `components/score-graph.tsx`：**残す**。再スタイルして本文の下に配置。
7. **CTA** … `components/match-chat.tsx` / `premium-match-chat.tsx` の導線ボタンをモックの CTA 見た目に。権限判定ロジックは不変。
8. **引用プロンプト 1 行** … `lib/llm/prompts/generate-recap.ts`（＋ preview 側プロンプト）に「本文中、最も重要な一文を 1 つだけ Markdown `>` 引用にする」旨を 1 行追加。**スキーマ・新フィールド・QA 変更なし**。

## 触ってはいけないもの

- DB スキーマ / マイグレーション / 新規クエリ（既存 `lib/db/queries/{match-content,match-events,standings,matches}.ts` のみ流用、署名不変）。
- パイプライン（上記 8 の 1 行を除き `lib/llm/*` に触れない）。モデル ID・段階構成・QA ロジックは不変。
- Premium ゲート/認証の**判定ロジック**（見た目のみ変更可）。
- events に無い**局面語・分岐点の断定**。本文・UI ラベルとも禁止。
- `rehype-raw` の導入（XSS 防止のため不可）。

## 既存の利用先

- 本文: `getPublishedContentForMatch(matchId)`（`lib/db/queries/match-content.ts`）。
- 要点根拠: `lib/db/queries/match-events.ts`（`minute`/`type`/`metadata.player_name`）。
- 順位: `lib/db/queries/standings.ts`。スコア/日時/会場/ステータス: `lib/db/queries/matches.ts`。
- ページの並列 fetch（`Promise.all`）構成は維持。
- チーム色: 現行 match-header のチームカラー解決を再利用（新規に色定義を増やさない）。

## エッジケース

- 主役得点の `minute` が null → 分を出さず表示（捏造しない）。
- 一度もリードを譲らない圧勝 → 「初めて 2 スコア差（8 点超）に広げた得点」を主役に。
- トライ無し（PG のみ）/ 引き分け（主役非表示・チップのみ）。
- events 欠損で再構成スコア≠最終スコア → 主役カード非表示。
- チーム色未設定 → ニュートラルフォールバックで破綻させない。
- 追加フォントは `font-display: swap` ＋必要ウェイトのみ preload（CLS/LCP 悪化させない）。
- **A案＝他サーフェス（ホーム/大会/選手/試合一覧）に波及**。トークン書き換え後、各ページの視覚回帰を確認し本 PR 内で是正。

## 完了の定義

- 仕様「受け入れ条件」を全て満たす。
- 主役選定の純関数に**単体テスト**（lead-clinching・圧勝・引き分け・minute null・整合不一致の各分岐）。
- 既存の本文表示テスト（Markdown / XSS / プレースホルダー状態遷移）が緑のまま。
- 320/375/768/1024/1440 でオーバーフロー無し。`/matches/[id]` が `docs/design/mock-1-soft-v3.html` に準拠。
- トークン書き換えによる他ページの視覚回帰が無い（目視 QA）。
- 変更は `app/globals.css` ＋ `components/` 中心。DB・パイプライン（1 行除く）不変をレビューで確認。
- デプロイは Owner 作業。
