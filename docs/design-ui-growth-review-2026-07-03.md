# デザイン・UI・集客 横断レビュー（2026-07-03）

> 評価手法: Playwright MCP による本番実測（desktop 1440px / mobile 375px、全12スクリーンショット）+ GSC（read-only API）+ GA4（MCP）+ コードベース調査。実装は行っていない（Claude Code は分析・仕様化のみ）。
> スクリーンショット: `docs/site-audit-screenshots/2026-07/`
> 前提資料: `docs/growth-audit-2026-07-01.md` / `docs/growth-playbook-2026-06.md` / `docs/site-audit-report-2026-05.md` `-05b.md` / `specs/fix-rwc2027-hub-page-gate.md`

---

## 事前確認: 本番とローカルの差分

- 直近 main（d87a4a6, PR #448 = RWC2027 ハブのゲート修正）は**本番反映済み**。`/c/rwc/2027` にプール順位表6面＋全36試合の日程が表示されることを実測で確認した。
- ローカルの未コミット変更は docs のみ。**実装コードのローカル/本番差分は無し**。

## 誤検出を排除した確認結果（先に共有）

フルページスクリーンショットで「壊れて見えた」以下の3点は、実測の結果**バグではない**（lazy-load / クライアント描画のアーティファクト）:

1. pricing のサンプル画像2枚（`/pricing/review-full.png`, `/pricing/ai-chat.png`）→ HTTP 200 で実在。lazy 未ロードで空白に写っただけ
2. ホーム大会アーカイブの PNC / RWC ロゴ空白 → `public/logos/pnc.svg` `rwc.svg` は実在し `app/page.tsx:44-61` のマッピングにも含まれる
3. 試合ページのペイウォール CTA「7日間無料でレビュー全文を読む」→ **存在する**が、クライアント側ハイドレーション後にのみ描画される（初期 HTML はスケルトン＋X/note フォローのみ）

ただし 3 は「初期描画に課金 CTA が無い」という**遅延 CVR 問題**として残る（後述）。また 1 は画像が重い（原寸 832KB / 配信 205KB @w=3840）ため低速回線では長時間空白になる。

---

## A. 総評

**デザイン評価: 62 / 100**

（内訳目安: デザインシステムの一貫性 8/10、第一印象・熱量 5/10、情報設計 6/10、モバイル 7/10、ビジュアル資産 4/10、有料説得力 6/10、SEO/OG 8/10 を重み付け）

### 強み

- **試合詳細ページのスコアヘッダー**（チームカラーのグラデーション＋大きなスコア＋シールドバッジ）はサイト内で最も「スポーツメディアらしい」瞬間。この方向を全サイトに広げる価値がある
- 白基調＋赤アクセント＋明朝系見出しのトーンは一貫しており、「よくできた分析アプリ」としての品位は既にある
- 試合ページの SEO 実装（title 69字・recap 由来 description・動的 OG・JSON-LD）は引き続き満点級
- シーズンページの折りたたみ節も**サーバー HTML には75試合分のリンクと順位表が全部入っている**（SEO 上の取りこぼしなし。UX の問題のみ）
- 権利面: ロゴ・チームバッジは全て自作抽象 SVG で、実在ロゴ・公式ユニフォーム・選手の顔は不使用。方針に忠実

### 弱み

- **ヒーロー以外に「絵」が無い**。ホーム下部〜大会〜シーズン〜カレンダーは白カードの羅列で、初見では「DBサイト」に見える。2026-05 監査の指摘から本質的には変わっていない
- **機械生成の痕跡が UI に露出**: プレビュー見出しの「セクション1: 両チームの現状」、レビュー待ち文言「コンテンツは自動生成されます。」— ¥980/月の分析メディアとしての信頼を最も安く毀損している箇所
- **大会に個性が無い**: ハブのバナーは全大会共通の芝生写真。大会別カラー（左ボーダー）はあるが弱い
- **シーズンページの情報設計**: ハブと同一のガイド長文が先頭に重複表示され、順位表（ページ title で謳っている主役）が最下部。18節すべて閉じたアコーディオン
- **順位表がチーム略号のみ**（NOR/BAT/EXE…）でライト層に不親切
- モバイルの「最近のレビュー」でチーム名が「ト…」「モ…」に潰れる

### 最初に直すべき3点

1. **機械生成痕跡の除去**（プレビュー見出し「セクション N:」・「自動生成されます」文言）— 信頼＝有料転換の土台。表示側の置換だけなら数行の変更
2. **シーズンページの IA 反転** — 順位表と直近節を上へ、ガイドは折りたたみで下へ。直近1〜2節はデフォルト展開
3. **ホーム→RWC2027 の導線修復** — 大会アーカイブの RWC カードが「最新シーズン→」= 2023 を指しており、検索需要が実証済みの `/c/rwc/2027` への内部リンクがホームに無い。fix-rwc2027-hub-page-gate と同種の「資産はあるのに見せていない」問題

---

## B. ページ別レビュー

### 1. トップページ `/`

- **良い点**: 動画背景ヒーロー＋「海外ラグビーを、日本語で深掘り。」の明朝見出しは方向性が良い。CTA（7日間無料/今週の試合）が明確。今週の試合→最近のレビュー→大会という流れ自体は正しい
- **課題**:
  - ヒーロー以下が白カードの単調な繰り返し。「最近のレビュー」が1行リストでコンテンツの深さ（サイトの本体価値）が伝わらない
  - 大会アーカイブ11枚が均質なリスト。ロゴ SVG がジェネリックな幾何学形で、大会の空気が出ない
  - RWC カードの最新シーズンが 2023。**/c/rwc/2027 への導線がホームに存在しない**
  - `og-image.png` が 1.4MB（SNS クローラのタイムアウト・表示遅延リスク）。ヒーロー動画 1.5MB も LCP に不利
  - ヒーロー動画・写真の出所ライセンスが repo 内で管理されていない（要確認）
- **デザイン改善案**: 「最近のレビュー」を 1 行リスト→レビュー冒頭の引用付き「エディトリアルカード」（大会カラー帯＋スコア大写し＋核心文の抜粋2行）に。大会アーカイブは「今シーズン進行中」と「アーカイブ」を分離し、進行中大会にキービジュアル背景を敷く
- **画像**: 入れるべき。①ヒーローは現動画を権利確認済みの生成画像 or 生成動画に置換（位置: 現状のまま）②進行中大会カード背景に大会別キービジュアル（薄く敷く）
- **優先度: 高**

### 2. カレンダー `/calendar`

- **良い点**: 全大会横断＋JST 表示のコンセプトは唯一性がある。行 UI は清潔
- **課題**: 今週1日分6試合のみでページが痩せて見える。全行が同大会・同時刻でリストが単調。会場名が英語。空白の帯が広い。「解説」バッジの意味が初見で分からない
- **デザイン改善案**: 曜日タブ or 週ナビゲーション（前週結果へのリンク）を追加し「今週しか無い」印象を消す。注目試合（日本代表戦など）を1枚だけ大きなフィーチャーカードに昇格。「解説」バッジに tooltip か凡例
- **画像**: 原則不要（情報 UI）。フィーチャーカードの背景に抽象グラデのみ
- **優先度: 中**

### 3. 料金 `/pricing`

- **良い点**: ダークヒーロー＋プロダクトデモ動画＋機能比較表＋サンプル画像＋FAQ という構成は既に説得力の骨格がある。canonical / og:locale / og:image は設定済み（05-06 監査の指摘は解消済みと実測確認）
- **課題**:
  - サンプル画像2枚が重く（832KB/256KB、`w=3840` 要求）、低速環境では巨大な空白のまま
  - サンプル画像が「スクリーンショット貼り付け」で、枠・影・デバイスフレームが無く素朴
  - ヒーロー直下の比較表まで視覚の谷がある。「10大会対応 500試合以上 7日間無料」の数字が小さい
  - og:image が共通 og-image.png（料金訴求ではない）
- **デザイン改善案**: サンプル画像をブラウザ/スマホフレームに収め、レビュー・チャットを並置。数字3点をスタットタイルに昇格。FAQPage JSON-LD の実装状態を確認（spec: `fix-pricing-canonical-faq-schema.md`。今回 JSON-LD 中身は未検証）
- **画像**: 既存スクリーンショット運用で十分。追加するなら背景の抽象テクスチャのみ。**新規生成の優先度は低**
- **優先度: 中**（CVR ページだが訪問数が絶対的に少ないため、流入側の改善が先）

### 4. 大会ハブ `/c/premiership`

- **良い点**: title「Premiership 順位表・日程・日本での視聴方法」は検索意図に合致。大会ガイド（概要・見どころ・視聴方法）はコンテンツとして価値がある。最近のレビューカードはチームカラー帯＋シールドで試合ページの言語と一致
- **課題**:
  - バナーが全大会共通らしき芝生写真（ラグビー文脈が薄い、2026-05b 監査 P1-1 が実質未解消）
  - ガイド長文が主役でメディアというより Wikipedia 調
  - 「最近のレビュー」に 2024-09 の試合が混在（鮮度ソートか対象範囲のバグ疑い。要確認）
  - ヒーロー内タイトルが英語「Premiership」のみ（カタカナ命名方針とちぐはぐ）
- **デザイン改善案**: 大会別キービジュアル＋大会カラーのグラデーションオーバーレイ＋カタカナ大会名を大きく。ガイドは冒頭2段落＋「もっと読む」。順位表上位3チームのミニ表を右カラムに
- **画像**: 入れるべき（最優先の画像投資先）。位置: ヒーローバナー全幅。内容: 大会ごとの「空気」を描いた抽象寄りスタジアム画（D 参照）
- **優先度: 高**

### 5. シーズンページ `/c/premiership/2025-26`

- **良い点**: サーバー HTML に全75試合リンク＋順位表が入っており SEO は健全。プレーオフカードの「レビューあり」バッジは良い導線
- **課題**:
  - **ハブと同一のガイド全文が再掲**され、first view が文章で埋まる（重複コンテンツ＋主役の埋没）
  - 第1〜18節が全て閉じたアコーディオンで、開くまで「空のページ」に見える
  - 順位表が最下部。title で「順位表」を先頭に謳っているのに、スクロール最深部でしか見えない（「データはあるのに見せていない」型）
  - 順位表が略号のみ（NOR/BAT…）。チーム名・順位変動・プレーオフ圏の色分けが無い
- **デザイン改善案**: 順序を「順位表（上位のみ→展開）→ 直近節（デフォルト展開・レビューありを強調）→ 過去節（折りたたみ）→ ガイド（折りたたみ）」に反転。順位表にカタカナチーム名＋プレーオフ圏の帯色
- **画像**: 不要（データ UI）。ヘッダーに大会カラーの抽象帯で十分
- **優先度: 高**

### 6. 試合詳細（レビューあり）`/matches/8a1e0f6f…`（ハリケーンズ 60-5 チーフス）

- **良い点**: スコアヘッダーはサイト最良の UI。核心→要点スタット→本文→ペイウォール→得点推移→AI チャットの流れは合理的。AI チャットは「ログインすると1問まで無料」＋サンプル Q&A が出る（ハイドレーション後）
- **課題**:
  - 「前半の最大リード」カードが半端な幅で浮く（要点カードが2枚で非対称）
  - ペイウォールの課金 CTA が**クライアント描画のみ**。初期 HTML はスケルトン＋「X / note で更新中」フォロー誘導だけで、遅い回線では課金導線が見えない時間が生じる（`fix-paywall-server-side-gating.md` の周辺論点）
  - AI チャット枠がハイドレーション前は大きな空白（プレースホルダ無し）
  - 得点推移グラフの下「すべての得点・カード」「試合前のプレビューを表示」の折りたたみが控えめすぎて資産（イベントデータ・プレビュー）が隠れる
- **デザイン改善案**: 要点カードを常に2〜3枚組のグリッドに正規化。ペイウォール CTA をサーバー描画に。AI チャットにスケルトン/静的サンプルを SSR で出す
- **画像**: ページ上部は不要（スコアヘッダーが既に強い）。本文の長文中に1枚、大会キービジュアルを薄く敷いた「章区切り」があってもよい程度
- **優先度: 高**（ペイウォール SSR）／ 中（その他）

### 7. 試合詳細（プレビュー・未開催）`/matches/42bebc1f…`（アルゼンチン vs スコットランド）

- **良い点**: 紺グラデのヘッダーで「未開催」を色で区別。核心の問い（引用形式）は良いフック。プレビュー全文無料は O2 戦略に合致
- **課題**:
  - **見出しが「セクション1: 両チームの現状」「セクション2: …」と機械ラベル露出**。最大の信頼毀損ポイント
  - レビュー枠の「コンテンツは自動生成されます。しばらくお待ちください。」が AI ラベリング方針（`project_ai_labeling`）と不整合
  - 「AI CHAT」のセクションラベルも同方針の未対応箇所
- **デザイン改善案**: 見出しは「両チームの現状」等の裸見出しに（表示側 strip か生成テンプレ修正。recap 版 `fix-recap-heading-format.md` のプレビュー版が spec 候補）。待ち文言は「レビューは試合終了後 30〜60 分で公開されます」等の時間約束型に
- **画像**: 不要
- **優先度: 高**（文言・見出しのみなら低コスト）

### 8. RWC2027 ハブ `/c/rwc/2027`

- **良い点**: ゲート修正が本番反映され、プール表6面＋36試合が表示されている。開幕前バナーも表示
- **課題**:
  - 全て 0 の順位表が6面連続でページ上部を占有し、**検索需要の本体である「日程」が下部**
  - チーム名が「ホンコ」「ジンバ」に切れる（カード内 truncate）
  - プール未確定枠が「-」のみ（「予選プレーオフ勝者」等の説明なし）
  - ホームからの内部リンクが無い（B-1 再掲）
- **デザイン改善案**: 開幕前は順位表を「プール別チームグリッド」（国旗＋カタカナ国名の4枚組×6）に置換し、日程を上へ。開幕後に現在の順位表へ自動切替（`tournamentStarted` は既にある）
- **画像**: 中期で1枚。位置: ページヘッダー。内容: 南半球の夏・豪州開催を想起させる抽象スタジアム画
- **優先度: 高**（RWC2027 は実需要が確認済みの唯一の成長中クエリ群）

### 9. OG / SNS 共有

- 試合ページ: `/api/og` 動的生成(スコア入り)で**既に良い**
- ホーム/pricing: 共通 `og-image.png` が 1.4MB。X/LINE のクローラに対して重すぎる。300KB 以下に再圧縮を推奨
- 大会ハブ/シーズン: og:image の個別化余地あり（大会キービジュアル流用で低コスト化できる）

---

## C. 画像提案一覧

| # | ページ | 位置 | 画像タイプ | 目的 | 生成画像の内容 | 避けるべき要素 | 推奨アスペクト比 | 優先度 |
|---|--------|------|-----------|------|----------------|----------------|----------------|--------|
| 1 | 大会ハブ ×10 | ヒーローバナー | 生成画像（大会別） | 大会の個性・臨場感 | 大会の地域・季節・時間帯を変えた抽象寄りスタジアム情景（D-3〜D-6） | 実在ロゴ・ユニフォーム・顔・文字 | 21:9（`1536×1024` を crop） | **高** |
| 2 | ホーム | ヒーロー背景（現動画の代替 or 権利確認まで暫定） | 生成画像 | 権利リスク解消＋LCP 改善 | ラインアウトのシルエット、逆光、粒子感（D-1） | 同上＋既存写真の模倣 | 16:9 | **高** |
| 3 | ホーム | 進行中大会カード背景 | ハブ用画像の流用（縮小・暗め） | アーカイブの均質感の打破 | #1 と同一アセット | — | 3:1 帯 | 中 |
| 4 | OG 背景 | `/api/og` の背景・`og-image.png` 差替 | 生成画像1枚 | SNS 共有の見栄え＋1.4MB 解消 | 暗いピッチ俯瞰＋ボール軌跡の光線（D-8）。文字・スコアは HTML/CSS 合成 | 文字・数字・ロゴ | 1200×630 | **高** |
| 5 | RWC2027 ハブ | ページヘッダー | 生成画像 | 実需要クエリの受け皿の質向上 | 豪州の夕景スタジアム、金色の光、群衆シルエット | 公式トロフィー形状・エンブレム | 21:9 | 中 |
| 6 | 試合詳細 | 本文セクション区切り（薄敷き） | CSS グラデ＋大会画像の極薄流用 | 長文の読み疲れ軽減 | 新規生成不要 | — | — | 低 |
| 7 | pricing | ヒーロー背景 | CSS グラデ＋粒子（画像不要） | 生成コストゼロで質感付与 | — | — | — | 低 |
| 8 | カレンダー | 注目試合フィーチャーカード | CSS グラデ＋国旗 | 単調さの解消 | 新規生成不要 | — | — | 低 |

**生成コスト試算**（OpenAI `gpt-image-1`、品質 high・1536×1024: 約 $0.25/枚）: 大会10枚 × 各3案 = 30枚 ≈ **$7.5**。ホーム・OG・RWC 追加分を含めても **$10〜15 の一回きり**。静的アセットとして配信するためランニングコストはゼロ（設計不変条件「試合単位キャッシュ」と同じ思想で「大会単位の静的資産」）。動的 OG は既存の `/api/og`（HTML/CSS 合成）に背景1枚を敷くだけなので生成 API を都度呼ばない。

---

## D. LLM 画像生成プロンプト

共通の末尾制約（全プロンプトに必ず付与）:
`no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark`

> **2026-07-03 追記**: D-1 は初稿で「観客が写らない・練習風景に見える」問題が発生（Gemini による試し焼きで判明）。修正版で `a packed stadium crowd filling the stands as dense anonymous bokeh silhouettes under the lights` を追加し解決。同時に、雨・光の描写が「炎・溶岩のような発色」になるアーティファクトも発生したため `no fire or lava-like effects` 系の抑制句を追加。以下は全てこの2点を反映した修正版。D-1 は実際に採用（Owner確認済み）。

**D-1. ホーム ヒーロー**（採用確定・Owner確認済み）
```
Cinematic wide shot of a rugby lineout at night, two players lifted high silhouetted against blinding stadium floodlights, a packed stadium crowd filling the stands as dense anonymous bokeh silhouettes under the lights, dramatic backlit haze and rain particles, dark navy and charcoal palette with a single warm red rim light, shallow depth of field on the foreground players while the crowd remains a soft glowing texture, shot from low angle, photorealistic sports photography style, moody and premium, generic dark kits with no visible design, faces obscured by shadow and motion blur, realistic water spray only (no fire or lava-like glow effects). no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-2. 大会ページ共通キービジュアル（フォールバック）**（観客は意図的に無し。無人スタジアムの抽象的な質感として使うため変更なし）
```
Abstract aerial view of a rugby pitch at dusk, glowing white pitch markings on deep green grass fading into darkness at the edges, subtle floodlight bloom in each corner, painterly photographic hybrid style, calm and premium atmosphere, empty stadium, wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-3. Premiership 用**（観客追加＋炎対策）
```
English club rugby atmosphere: a rain-soaked pitch under heavy grey winter sky, a packed stadium crowd filling the tight compact old stands as dense anonymous bokeh silhouettes, steam rising from a scrum of anonymous players in plain dark heritage-style kits, mud on white pitch lines, gritty film-grain texture, cold desaturated palette with deep green and slate, realistic water spray only (no fire or lava-like glow effects), wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-4. Six Nations 用**（元々観客ありだが密度を強化）
```
Grand European winter international rugby night: monumental floodlit stadium bowl seen from the tunnel mouth, every seat filled with a dense anonymous crowd rendered as glowing bokeh, breath fog in freezing air, dark emerald and midnight blue palette with gold floodlight flare, sense of anthem-moment gravitas, wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-5. Rugby Championship 用**（観客追加＋発色対策）
```
Southern hemisphere test rugby at golden hour: vast open-bowl stadium packed with an anonymous crowd as warm bokeh silhouettes against a huge orange-violet sunset sky, long shadows across sunburnt grass, dust and heat haze, powerful anonymous silhouettes contesting a high ball, warm amber and deep teal palette, natural sunset lighting only (no fire or lava-like glow), epic scale, wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-6. Super Rugby Pacific 用**（観客追加＋発色対策）
```
Pacific rugby energy: vivid twilight stadium near the ocean packed with an anonymous crowd as saturated bokeh silhouettes, palm silhouettes beyond the stands, saturated turquoise and coral sky, floodlights mixing with tropical dusk, anonymous players in plain bright kits mid-sprint with motion blur, festive high-energy atmosphere, natural floodlight glow only (no fire or lava-like effects), wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-7. 試合詳細ページ用 抽象背景**（観客不要のため変更なし）
```
Very subtle abstract background texture: faint white rugby pitch line geometry (halfway line, 22-metre arcs) on a near-black charcoal gradient, extremely low contrast, fine grain, designed to sit behind foreground interface text, minimal and unobtrusive. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-8. OG 画像用 背景**（「glowing arc of light」がD-1初稿と同じ炎化リスクのため発色対策を追加）
```
Dark premium social-card background: top-down view of a rugby pitch at night fading to black at the edges, one soft arc of light tracing a kicked ball's trajectory across the frame (a clean lens-flare-style light trail, not fire or embers), deep navy base with a single warm red accent glow, strong left-side negative space reserved for overlaid interface elements, clean and minimal, 1200 by 630 composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**D-9. pricing ページ用 背景**（観客・炎リスクなしのため変更なし）
```
Quiet premium dark background: extreme close-up of rugby ball surface texture (generic pebbled leather, no branding) emerging from shadow on the right edge, deep charcoal-to-black gradient with soft red ambient glow, large empty negative space on the left for overlaid interface content, luxurious and restrained. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

---

## E. 実装するならどこを触るべきか（Codex 委譲前提の見取り図）

### 関連ファイル / コンポーネント

| 改善 | 触る場所 |
|------|---------|
| プレビュー見出し「セクション N:」除去 | 表示側: `components/match-content-section.tsx`（recap 版の `fix-recap-heading-format.md` と同じ手法）。恒久対応は生成テンプレ側 `lib/llm/` のプレビュープロンプト |
| 「自動生成されます」文言 | `components/content-placeholder.tsx`（レビュー待ち状態の文言）＋ `fix-ai-copy-labels.md` の残タスクに合流 |
| シーズンページ IA 反転 | `app/c/[competition]/[season]/page.tsx`、`components/season-match-groups.tsx`（デフォルト展開制御）、`components/standings-table.tsx`（フルネーム・圏内色分け） |
| ホーム RWC 導線 | `app/page.tsx`（大会アーカイブの RWC カードの遷移先/最新シーズン解決。`lib/db/queries` の「最新シーズン」ロジックが 2027 を future として除外していないか確認） |
| 大会キービジュアル | `app/c/[competition]/page.tsx` のヒーロー部＋新規 `public/visuals/{family}.webp`（`public/logos/` と同じ family キー命名。`app/page.tsx:44` の `COMPETITION_LOGO_FAMILIES` を流用） |
| ペイウォール SSR | `components/paywall.tsx` / `components/premium-recap-section.tsx`（既存 spec `fix-paywall-server-side-gating.md` と整合確認） |
| OG 軽量化・刷新 | `public/og-image.png` 差替（≤300KB）、`app/api/og/`（背景差し込み）。`public/og-bg.png` が既にあるので同じ経路 |
| RWC2027 プールグリッド | `app/c/rwc/2027/page.tsx`（`tournamentStarted` 分岐は実装済みなので、開幕前の standings 表示だけ差し替え） |
| モバイルのチーム名切れ | `components/match-card.tsx` 系の truncate 指定（2026-05b P2-1 の残課題） |

### 画像の置き場所

- `public/visuals/`（新設）に `{family}.webp` ＋ `{family}-og.webp`。`public/logos/` の family スラッグと 1:1 対応させる
- 生成元 PNG は `docs/design/assets/`（git 管理・再生成プロンプトを README に併記）

### リスクの低い実装順

1. 文言・見出しの表示側修正（回帰リスクほぼゼロ）
2. `og-image.png` 圧縮差替（アセット差替のみ）
3. ホーム RWC カードの導線修正（1カードのリンク先）
4. シーズンページの並び替え＋デフォルト展開（レイアウト変更・要テスト）
5. 順位表のフルネーム化（`standings-table.tsx`＋モバイル幅の再検証）
6. 大会キービジュアル導入（アセット準備が済んでから一括）
7. ペイウォール SSR 化（課金導線に触るため最後に単独 PR で）

**変更の粒度**: 1〜3 は各1 PR の小粒。4〜5 はシーズンページ 1 spec。6 は全ハブ共通 1 spec。7 は単独 spec。

---

## F. 集客観点のまとめ

### 実測サマリー（2026-07-03 取得。前回 07-01 比）

| 指標 | 07-01 | 今回 | 変化 |
|------|-------|------|------|
| GSC クリック（28日: 06-02〜06-29） | 4 | 4 | 横ばい |
| GSC インプレッション | 1,286 | 1,290 | 横ばい |
| 選手ページのインプレ比率 | 79% | 78%（1,009/1,290） | 微減（想定通りの自然減待ち） |
| GA4 セッション（28日: 06-05〜07-02） | 115（4.1/日） | 130（4.6/日） | 微増 |
| チャネル内訳 | — | Direct 51 / Organic 50 / Referral 18 / Social 5 | Organic が Direct と並んだ |
| RWC クエリ順位 | 29〜58位 | 「2027 ワールドカップ」10位、他 28〜51位 | 一部改善の兆し（#448 直後） |

**新しい発見**: 「スコットランド 対 ポルトガル」で試合ページが**平均 6.2 位・82 インプレ・0 クリック**。1ページ目に居てもクリックされていない = タイトル/スニペットの CTR 問題が「順位の問題」から分離して初めて観測された。ホーム経由 50 セッションに対し大会ページ（PNC 2026）が 3 クリック/58 インプレ/10.3 位で刈り取れており、「大会×シーズン」ページ群が現状最良の SEO 資産。

### デザイン改善 × 集客ボトルネックの対応表

| ボトルネック | 現状証拠 | 効くデザイン/UI 改善 | playbook 整合 |
|--------------|----------|---------------------|---------------|
| 認知（被リンク・網） | 参照ドメイン計測なし・Social 5/28日 | （UI では解けない）S3/X2 は Owner 運用が主役 | S3・X2（未着手のまま最大レバー） |
| SERP CTR | pos6.2 で 0 クリック | OG/title の魅力向上、動的 OG 背景刷新（C-4）、og-image 1.4MB の軽量化 | S2/S6 の延長 |
| 信頼（品質確認前の離脱） | 「セクション1:」露出・「自動生成」文言 | B-7 の文言修正、B-6 ペイウォール SSR | O2（無料サンプルの説得力）の土台 |
| 回遊性 | シーズンページ全折りたたみ・順位表最下部・RWC 導線欠落 | B-5 IA 反転、B-1 RWC カード導線 | S7（常設 SEO ページ）・RWC2027 優先方針 |
| CVR | 課金 CTA がハイドレーション後のみ・pricing サンプル画像遅い | ペイウォール SSR、pricing 画像最適化 | O2 |

**率直な優先順位判断**: トラフィックがゼロ近傍（4.6 セッション/日）の現状では、デザイン改善は CVR・信頼の「受け皿」整備であり、**流入そのものは S3（被リンク）と X2（reply 運用）が依然として律速**。今回の提案のうち集客に直結するのは「RWC2027 導線＋ハブ品質」「OG 刷新」「機械生成痕跡の除去（O2 サンプル共有の前提）」の3点。全面的なビジュアル刷新は RWC2027 に向けた中期投資として位置づけるのが妥当。

### 優先度付き施策リスト（spec 化候補。起票は Owner 判断）

1. **fix-preview-section-headings**（セクション N: 除去）— 低コスト・信頼直結
2. **fix-content-placeholder-copy**（自動生成文言 → 時間約束型。`fix-ai-copy-labels.md` に合流可）
3. **fix-home-rwc2027-link**（ホーム大会カード→2027 ハブ）
4. **fix-og-image-weight**（1.4MB→≤300KB、D-8 で刷新）
5. **feat-season-page-ia**（順位表上移動・直近節展開・ガイド折りたたみ・順位表フルネーム）
6. **feat-competition-key-visuals**（生成画像10枚＋ハブヒーロー刷新。$10〜15）
7. **fix-rwc2027-pre-tournament-pools**（0-0 順位表→プールグリッド）
8. （既存 spec の実行確認）`fix-paywall-server-side-gating.md` / `feat-sample-recap-public.md`（O2）

---

## G. 改修ロードマップ

### フェーズ1: すぐできる軽微改善（〜2週間、画像生成なし）

- F-1〜F-4（文言・見出し・RWC 導線・OG 軽量化）
- モバイル「最近のレビュー」チーム名切れの修正
- カレンダーの「解説」バッジ凡例
- 効果: 信頼毀損の止血＋RWC2027 内部リンク＋SNS カード表示の安定化

### フェーズ2: 画像生成を含む中規模改善（2〜6週間）

- 大会キービジュアル10枚生成（$10〜15）→ ハブヒーロー刷新（B-4）→ ホーム進行中大会カード・OG 背景へ流用（C-3, C-4）
- シーズンページ IA 反転＋順位表リッチ化（B-5）
- RWC2027 開幕前プールグリッド（B-8）
- ホーム「最近のレビュー」のエディトリアルカード化（B-1）
- 効果: 「DBサイト感」の解消の中核。1アセットを3箇所（ハブ/ホーム/OG）で使い回し投資効率を上げる

### フェーズ3: デザインシステム全体の改善（RWC2027 を見据えた中期、集客連動）

- `docs/design/` モック（案2 大胆グラフィック / 案3 余白プレミアム / editorial）から方向を1つ選定し、design.md（トークン定義: 大会カラー・タイポスケール・カード階層）として成文化（`project_design_direction` の懸案）
- 試合詳細のエディトリアル化（`feat-match-page-redesign.md` 既存 spec と統合）: 章見出し・引用・根拠スタットのサイドノート
- ペイウォール SSR ＋ pricing のデバイスフレーム化（CVR 系）
- O2（無料サンプル公開）と連動: サンプル記事を「共有されたときに一番見栄えのするページ」として磨き、S3 被リンク獲得の受け皿にする
- RWC2027 特設ビジュアル（D-5 系）＋ 国別ページ拡充（`p3-rwc-2027-prep.md`）

---

## 未解決の質問（Owner 判断事項）

1. ヒーロー動画 `hero-bg.mp4`・大会ハブ芝生写真の**出所ライセンス**はどこかに記録があるか（無ければ生成画像への置換を優先度「高」に上げる）
2. 大会ハブ「最近のレビュー」に 2024-09 の試合が混ざる件はバグ扱いで調査するか
3. フェーズ2 の画像生成スタイル（D-3〜D-6 の写実寄り vs 案2/案3 モック由来のグラフィック寄り）どちらの路線か
4. spec 化候補 F-1〜F-7 のうちどれから起票するか
