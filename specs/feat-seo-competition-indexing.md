# 競技ハブ/現行シーズンの索引促進（ナビ内部リンクの向け直し）

## 背景

GSC 実測（2026-06-21、[[reference_gsc_analysis_tool]]）で、流入の律速は**コンテンツ不足ではなく索引不足**と判明:

- シーズンページ（`app/c/[competition]/[season]/page.tsx:85`）は既に JP クエリ最適化済み（title=「<競技名> 順位表・試合結果・日本語レビュー」、順位表・試合一覧の実コンテンツ、競技名はカタカナ）。**供給側の中身は十分**。
- しかし URL Inspection で **競技ハブ10枚中 索引済み2枚のみ（pnc/premiership）、8枚が"Google未認識"**。`/c/six-nations/2026`,`/2027`,`/c/rwc/2027`,`/c/league-one/2025-26` 等の現行/今後シーズンも未索引。全て sitemap に提出済み＝提出漏れでなく**クロールされていない**。

**根本原因（smoking gun）**: グローバルナビ `components/competition-nav-dropdown.tsx:10` の `HEADER_COMPETITIONS` がハードコードで**旧シーズンを指している**:
- six-nations/**2025**、rwc/**2023**、top-14/**2024-25**、rugby-championship/**2025** ← 旧シーズン
- bare ハブ（`/c/six-nations` 等）はナビ未リンク

最高 link-equity のグローバルナビが旧ページを指し、現行シーズン/bare ハブにクロールが流れない。実際、**ナビが指す旧シーズンは索引済み・ナビに無い現行は未索引**で相関。需要が伸びるはずの現行/今後シーズン（RWC2027 含む）が Google に存在しない。

加えて、北極星の `app/c/rwc/2027/page.tsx:14` は title が**英語ハードコード**（"Rugby World Cup 2027"）で JP クエリを狙えていない。

## スコープ

対象:
1. **`components/competition-nav-dropdown.tsx` のナビを現行に向け直す**。各 family の固定旧シーズンをやめ、**bare ハブ `/c/<family>`（evergreen・メンテ不要）へリンク**する（ハブが最新シーズンへ誘導する設計を前提）。ラベルは日本語/カタカナへ統一（例「シックス・ネーションズ」「ラグビーチャンピオンシップ」）。
2. **bare ハブページ（`app/c/[competition]/page.tsx`）が現行シーズンへ目立つ内部リンクを持つ**ことを保証（ナビ→ハブ→現行シーズンでクロールが流れる）。8枚の未索引ハブが crawl されるようにする。
3. **`app/c/rwc/2027/page.tsx` の title/description を日本語化**し、JP クエリ（「ラグビーワールドカップ2027 日程/出場国/放送」等）を狙う。動的シーズンページと同等のメタ品質に揃える。

対象外:
- **match recap ページの noindex は行わない**（誤った初期仮説の訂正）。sitemap の match は `listMatchIdsWithContent()` で既に中身ありに限定済み、816 published recap は製品本体。
- カタカナ命名の追加（teams/competitions は #395 で実装済み）。
- 被リンク/ドメイン権威（外部依存・別レーン。[[project_growth_channel_decision]] / Cルート）。
- h2h・round-hub のクロール整理（任意・未解決の質問へ。本 spec のコアではない）。

## データモデル変更

なし。最新シーズン解決は既存 `listSeasonsByFamily`（`lib/db/queries/competitions`）を利用。bare ハブのリダイレクト/誘導も既存ロジックを使う。

## API サーフェス

なし（新規ルート・エンドポイントなし）。

## UI サーフェス

- `components/competition-nav-dropdown.tsx`: `HEADER_COMPETITIONS` を bare ハブ `/c/<family>` リンク＋日本語ラベルへ。可能なら定数のハードコードを減らし、family 一覧から生成（ラベルは family→日本語名のマップ）。挙動（開閉・a11y）は不変。
- `app/c/[competition]/page.tsx`（bare ハブ）: 現行シーズンへの明確な内部リンク（CTA/見出しリンク）を確保。
- `app/c/rwc/2027/page.tsx`: 日本語 title/description。

## LLM 連携

なし。

## 受け入れ条件

1. グローバルナビの各競技リンクが **bare ハブ `/c/<family>`**（または各 family の**現行**シーズン）を指し、旧シーズン固定（six-nations/2025・rwc/2023・top-14/2024-25・rugby-championship/2025）が消えている。
2. ナビラベルが日本語/カタカナ（英語のみの "Premiership" 等を日本語表記に）。
3. bare ハブページ `/c/<family>` から現行シーズンページへの内部リンクが存在する（クローラが辿れる）。
4. `app/c/rwc/2027/page.tsx` の `title`/`description` が日本語で、JP クエリ（日程/出場国/放送 等）を含む。
5. match recap/preview ページの索引可否は変更しない（noindex を追加しない）。
6. 既存の a11y・開閉挙動・スタイルが回帰しない。必要なテスト（ナビのリンク先・ラベル）を追加。

検証（マージ後、Owner）:
- デプロイ後に Search Console で `/c/six-nations`,`/c/six-nations/2027`,`/c/rwc/2027` を **URL 検査 → インデックス登録をリクエスト**。
- 週次で [[reference_gsc_analysis_tool]] の `--inspect competitions` を回し、未索引ハブ数が 8→減るか、競技ページの impressions/clicks が増えるかを追跡。

## 確定事項（Owner が推奨採用、2026-06-21）

1. **ナビのリンク先 = bare ハブ `/c/<family>`**。evergreen でメンテ不要、未索引ハブ8枚も同時に crawl 対象化。ハブページが現行シーズンへ確実に誘導すること（スコープ2）を前提とする。
2. **ラベルは日本語/カタカナ**。`competitions.name_ja`（#395 で全 family 保有）から family→日本語名を引いて使う。DB 由来が難しい family（複数シーズンを束ねる総称）は定数マップで補う。
3. **h2h・round-hub のクロール整理は本 spec に含めない**。別フォローアップとし、コア（ナビ向け直し＋ハブ索引促進）の効果を先に GSC で検証してから判断。
4. **RWC2027 = 静的ページのまま日本語メタだけ修正**（最小）。`title`/`description` の日本語化に留め、動的テンプレ移行はしない（bracket 子ページ等のカスタム構造を壊さない）。

### 残るセットアップ（Owner、マージ後）

- Search Console で `/c/six-nations`・`/c/six-nations/2027`・`/c/rwc/2027` を URL 検査 → インデックス登録をリクエスト。
- 週次で [[reference_gsc_analysis_tool]] の `--inspect competitions` を回し、未索引ハブ数の減少と競技ページの impressions/clicks を追跡。
