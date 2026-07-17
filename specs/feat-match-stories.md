# feat-match-stories: マッチストーリーズ v1（週→試合→Story Item）

**ステータス: 確定（2026-07-17 Owner 承認。§20 の全項目を推奨案どおり決定済み）**

対象リポジトリ: **tryline（Web/API）＋ tryline-mobile（iOS）**。実装順は必ず Web → iOS（API コントラクトの正は Web 側）。

## 1. 背景・解決したい問題

iOS アプリのホーム（今週のカレンダー）は試合一覧であり、「1 つの試合を追いかける」体験がない。試合には Preview → 試合結果 → Recap という時系列のコンテンツが既に存在するが、それぞれ試合詳細ページの中に埋まっており、(1) 気づかれない、(2) テンポよく連続閲覧できない、(3) シェアしたくなる見た目になっていない。

Instagram Stories 型の全画面ビューアーで、週内の各試合のコンテンツを「Story Item」として連続閲覧・共有できるようにする。

主目的:
1. ホーム画面で試合関連ニュースに気づかせる
2. 複数のニュースをテンポよく連続閲覧させる
3. Instagram Stories 等へシェアしたくなる見栄えと導線を作る

なお、2026-07-15 に保留とした「外部メディアの OG 画像を表示する Match Stories」構想とは**別物**である。本仕様は **Tryline 自身が生成したコンテンツのみ**を扱うため、外部メディアの著作権・robots.txt 検証タスク（6 項目）は前提にならない。外部ニュースの取り込みは Phase 3 の `news` タイプで再検討し、その時点で当該検証タスクが前提条件として復活する。

## 2. 目標

- 週 → 試合 → Story Item の 3 階層でコンテンツを配信する API を Web 側に追加する
- iOS ホームに「今週のマッチストーリーズ」横スクロールセクションを追加する
- 全画面ビューアー（前後移動・閉じる・試合詳細へ・共有）を実装する
- 9:16 の portrait 画像を Web 側 OG 基盤で生成し、iOS はそれを表示・共有するだけにする
- Phase 1 は **preview / result / recap** の 3 タイプ。API 型は将来タイプを追加可能な形にする

## 3. 非目標（スコープ対象外）

- Web サイト側の Stories UI 表示（API と画像生成のみ Web 側。Web の UI 追加は将来別 spec）
- 外部メディア記事の取り込み・表示（Phase 3、別 spec ＋著作権検証タスクが前提）
- `match_news` 等の新規永続テーブル（Phase 1 では作らない。§9 の比較参照）
- アプリ内 LLM 呼び出し・アプリ内での本文/画像の生成・改変
- IAP・価格表示・購入導線（審査 3.1.1。locked 時は既存契約者へのログイン案内のみ）
- 自動投稿・SNS API 連携（共有は iOS share sheet を開くまで）
- 既読のアカウント同期（v1 は端末ローカルのみ。§13）
- 過去週アーカイブ UI（API は from/to を受けるので技術的には可能だが、v1 の UI は今週のみ）
- サードパーティ analytics SDK の追加（§16）
- Universal Links / AASA 設定（v1 の共有 URL は通常の Web URL。§8-共有）

## 4. 用語とコンテンツ階層

```
週（JST 月曜〜日曜）
└─ 試合（match_id 中心。設計不変条件どおり）
   └─ Story Item（type: preview | result | recap、将来 lineup | mom | news）
```

- **Story Item**: 1 画面ぶんのカード。タイトル・要約・画像・遷移先を持つ
- **試合カード**: ホーム横スクロールの入口。丸アイコン模倣ではなく、対戦カード＋画像＋件数＋未読が分かるカード
- **ビューアー**: 全画面表示。試合内は Item を順送り、試合を見終えたら次の試合へ

## 5. 現状調査の結果（2026-07-17 実測）と依頼前提との食い違い

### 現状

- API v1（BFF）: `app/api/v1/`（calendar / competitions / matches/[id] / matches/[id]/content / me / push）。レスポンスは `ApiEnvelope<T>`＋**snake_case**（`lib/api/v1/types.ts`）
- コンテンツ: `match_content`（`unique(match_id, content_type)`、`content_type in ('preview','recap','tactical_notes')`、`content_md`、`status`、`generated_at`）。**title / summary カラムは存在しない**
- Premium ゲート: `app/api/v1/matches/[id]/content/route.ts` が `splitRecapForPaywall`（`lib/match-content/markdown.ts`）でサーバー側分割。locked 本文はレスポンスに含めない設計が既に確立
- 週定義: Web `lib/format/week.ts`（`getJstWeekRangeUtc` 等）・iOS `src/api/dates.ts`（`getJstWeekRange`）の両方で **JST 月曜〜日曜**が確立済み
- OG 画像: `app/api/og/route.tsx`。type = 既定(match) / result / competition / calendar / round-scoreboard。**全て 1200×630 landscape。portrait は存在しない**。match/result 型はスコアを **URL クエリ（hs/as）で受け取る**方式
- iOS spoiler guard: 端末ローカル設定（`src/settings/SettingsProvider.tsx`、SecureStore キー `tryline.spoilerGuard`、**デフォルト ON**）＋セッション内 `revealedMatchIds`。スコア表示は `ScoreText` で固定サイズマスク
- iOS ホーム: `app/(tabs)/index.tsx` が calendar API で今週の試合一覧を表示（週送りあり）
- iOS 共有基盤: なし（share sheet 未使用）。`app.config.ts` に associatedDomains なし、カスタム scheme `tryline` のみ
- iOS analytics: **一切なし**（SDK・自前計測とも）

### 依頼前提との食い違い（推測で埋めず報告する）

| # | 依頼の前提 | 実態 | 本仕様での扱い |
|---|---|---|---|
| 1 | `destination: { type: "article"; articleId }` | Tryline に独立した記事エンティティ・記事 URL は存在しない。preview/recap は `/matches/[id]` ページ内セクション | Phase 1 の destination は `match` のみ。`article` は Phase 3 の news で導入余地として union に残す |
| 2 | MOM は Phase 2「構造化データから生成可能」 | MOM は DB に存在せず recap 内の **LLM 推論**。公式と食い違った実績あり（リーグワン決勝） | MOM Item は「MOM データ化」spec（未起票）が先。Phase 2 から**条件付き**に降格 |
| 3 | Lineup は Phase 2 候補 | lineup 取り込みは大会依存で穴が大きい（国際大会の季節ページ非対応が既知） | 同上、`feat-ingest-lineups-season-page-fallback` 等の解消後に着手 |
| 4 | portrait 画像を OG 基盤で | 既存 OG は landscape のみ | portrait は新規実装（§11）。実現可能（@vercel/og はサイズ任意） |
| 5 | たたき台 API は camelCase | v1 API は snake_case が既確立 | **snake_case に統一**（§10） |
| 6 | シェア先からアプリへ戻る導線 | Universal Links 未設定 | v1 は Web URL 共有のみ。AASA 対応は Phase 2 以降の別作業 |
| 7 | 計測（論点 10） | アプリに計測基盤ゼロ。SDK 追加は「仕様にない依存パッケージ禁止」と衝突 | v1 は計測なし＋UTM とサーバーログで代替（§16） |
| 8 | 既存 OG match/result 型の URL にスコアが載る | ストーリー画像で同方式だと URL からスコアが漏れる | story 型は **match_id だけ受けて DB から描画**（§11） |

## 6. ユーザーフロー

```
ホーム（今週のラグビー）
  │ 上部に「今週のマッチストーリーズ」横スクロール
  │   [試合カード] [試合カード] [試合カード] →
  ▼ カードをタップ
全画面ビューアー（その試合の Item 1 件目から）
  ├ 画面右側タップ / 自動送り → 次の Item
  ├ 画面左側タップ → 前の Item
  ├ 左右スワイプ → 次/前の試合へ
  ├ 最後の Item の次 → 次の試合の 1 件目（最終試合なら閉じる）
  ├ 下スワイプ / ✕ → ビューアーを閉じる
  ├ 「試合詳細を見る」→ router.push("/matches/<id>")（既存ルート）
  └ 共有ボタン → iOS share sheet（portrait 画像＋URL）
```

データフロー:

```
match_content / matches ──(集約)──▶ GET /api/v1/stories ──▶ iOS（表示のみ）
matches・match_content ──(描画)──▶ GET /api/og?type=story ──▶ Item 画像・共有画像
```

## 7. UI 要件

### ホームセクション「今週のマッチストーリーズ」

- `app/(tabs)/index.tsx` の週ナビ直下に横スクロール（`FlatList horizontal`）を追加
- 試合カード（縦長 約 140×200pt 目安）: **portrait 画像のサムネイル**＋対戦カード（`TeamIdentity` の旗・略称を再利用）＋Item 件数＋未読ドット
- Item が 1 件以上ある試合のみ表示。0 件の週はセクション自体を非表示（空の帯を出さない）
- 未読が 1 件でもあるカードはアクセントカラーの枠、全部既読は通常枠（Instagram の既読リング相当を枠線で表現）

### ビューアー

- 全画面モーダル（expo-router のモーダル or `Modal`。**新規パッケージ追加禁止**）
- 上部: 試合内 Item 数ぶんのセグメント式プログレスバー（自動送りの進行を表示）
- 本体: portrait 画像を背景に、タイトル・要約・published_at をオーバーレイ（画像取得失敗時は §14 のフォールバック）
- 下部: 「試合詳細を見る」ボタン＋共有ボタン（44×44pt 以上）
- デザイン品質: `src/theme/tokens.ts` のトークンを使用。編集紙面路線（`feat-mobile-editorial-polish` の方向）と整合させ、テンプレ的な白カード羅列にしない。**Owner の実機目視評価を受け入れ条件に含める（§19-15）**

## 8. 状態遷移と操作仕様

### ビューアー操作（2026-07-17 Owner 確定）

| 操作 | 挙動 |
|---|---|
| 画面右 2/3 タップ | 次の Item（最終なら次の試合） |
| 画面左 1/3 タップ | 前の Item（先頭なら前の試合の最終 Item） |
| 左/右スワイプ | 次/前の試合の 1 件目 |
| 下スワイプ・✕ | 閉じる |
| 長押し | 自動送り一時停止（離すと再開） |
| 自動送り | ON（既定）。表示時間 = clamp(5s + 要約文字数×0.05s, 5s, 12s)。定数は 1 箇所で管理 |

- Reduce Motion 有効時: 自動送り無効・遷移はフェードのみ
- VoiceOver 有効時: 自動送り無効。Item は accessibilityLabel（タイトル＋要約）を持ち、標準スワイプで前後移動できる

### spoiler guard との連動（既存機構を壊さない）

- spoilerGuard ON かつ finished かつ `revealedMatchIds` 未開示の試合では、`contains_result: true` の Item（result / recap）を**マスク画面**（スコア非表示の中間画面「結果を見る」）に差し替える
- マスク中は該当 Item の**画像を fetch しない**（プリフェッチ経路からのスコア漏れ防止。URL 自体にスコアが載らない設計と二重の防御。§11）
- 「結果を見る」タップで開示 → 既存の `revealedMatchIds` に追加（試合詳細・カレンダーのマスク解除と同一状態を共有。ビューアー独自の開示状態を持たない）
- マスク中は共有ボタンを disabled にする（開示済み Item の共有は確認ダイアログなしでよい: 開示 = ユーザーの明示操作済みのため）
- preview Item と、finished でない試合の Item はマスク対象外

## 9. Web 側のニュース集約モデル

### Phase 1（採用推奨）: 新規テーブルなし、リクエスト時集約

`GET /api/v1/stories` のハンドラ内で既存テーブルから決定的に構成する:

| type | ソース | 掲載条件 | published_at |
|---|---|---|---|
| preview | `match_content`(preview, published) | 存在すれば | `generated_at` |
| result | `matches` | `status='finished'` かつ両スコア non-null | `matches.updated_at` |
| recap | `match_content`(recap, published) | 存在すれば | `generated_at` |

- Item の `id` は `"<match_id>:<type>"` の決定的文字列（永続 ID 不要、既読管理にも使う）
- title / summary はサーバー側で**決定的に**組み立てる。LLM は呼ばない:
  - title: `"プレビュー"` / `"試合結果"` / `"レビュー"` ＋ 対戦カード名（`name_ja`）
  - summary: preview/recap は本文（recap は `splitRecapForPaywall().freeMd` **のみ**）の最初の段落から Markdown 記法を除去し全角 120 字で文境界カット。result は `"日本 27-10 イタリア"` 形式のテンプレ文字列
- 並び順: 試合は `kickoff_utc` 昇順（calendar と同一）。試合内 Item は **preview → result → recap の固定順**（時系列ナラティブ。published_at 順にしない: 再生成で generated_at が入れ替わっても順序が壊れないため）
- 中止 (cancelled): 試合ごと除外。延期 (postponed): preview があれば preview のみ掲載
- 1 試合あたり最大 3 件（Phase 1 は構造上 3 件で頭打ち。将来タイプ追加時に上限を再定義）

### 比較検討: `match_news` 永続テーブルを最初から作る案（不採用）

| 観点 | リクエスト時集約（採用） | match_news 永続化 |
|---|---|---|
| マイグレーション | 不要 | 必要（＋ページ描画経路が読むためマージ前本番適用が必須ルール） |
| 既存コンテンツとの二重管理 | なし | preview/recap を news 行へ同期する仕組みが必要になり事故源 |
| 任意ニュース（Phase 3） | 不可 | 可 |
| 判断 | **Phase 1 はこちら**。API 契約を汎用化しておけば、Phase 3 で `news` タイプの供給源として `match_news` を追加してもクライアントは無変更 | Phase 3 で編集者投入ニーズが確定した時点で導入 |

## 10. API コントラクト

`lib/api/v1/types.ts` に追加（**snake_case・ApiEnvelope 準拠**。既存規約に合わせ、たたき台の camelCase は採用しない）:

```ts
export type V1StoryItemType = "preview" | "result" | "recap";
// 将来: "lineup" | "mom" | "news" を union に追加（クライアントは未知 type を無視する規約。§10-互換性）

export type V1StoryItem = {
  contains_result: boolean;
  destination: { type: "match"; url: string }; // 将来 { type:"article"; url } を追加余地
  id: string;                 // "<match_id>:<type>"
  image: { landscape_url: string; portrait_url: string };
  premium_required: boolean;  // ユーザー非依存（§12）
  published_at: string;       // ISO 8601 UTC
  summary: string | null;
  title: string;
  type: V1StoryItemType;
};

export type V1MatchStories = {
  items: V1StoryItem[];       // 1 件以上（0 件の試合は matches に含めない）
  match: V1CalendarMatch;     // 既存型を再利用
  updated_at: string;         // items の published_at の最大値
};

export type V1StoriesData = {
  matches: V1MatchStories[];
  week: { from: string; label: string; to: string }; // label は formatJstWeekRangeLabel を再利用
};
```

- エンドポイント: `GET /api/v1/stories?from=YYYY-MM-DD&to=YYYY-MM-DD`（省略時は今週。パラメータ検証は `app/api/v1/calendar/route.ts` の実装を踏襲）
- 認証不要・**ユーザー非依存**（§12）。キャッシュは calendar と同じ public CDN キャッシュ方針（`lib/api/v1/response.ts` の既存定数を再利用）
- 互換性規約: iOS クライアントは未知の `type` の Item を**黙って読み飛ばす**（将来タイプ追加でアプリ強制アップデートを不要にする）。この規約を両リポジトリの型スナップショットにコメントで明記
- マージ後は `lib/api/v1/types.ts` → `tryline-mobile/reference/api-types.ts` の手動同期を実施（確立済み運用）

## 11. OG／Stories 画像生成仕様

`app/api/og/route.tsx` に `type=story` を追加:

```
GET /api/og?type=story&match=<uuid>&item=<preview|result|recap>&orientation=<portrait|landscape>&v=<epoch>
```

- **スコア・チーム名等を URL クエリで受け取らない**。`match` の UUID だけを受け、サーバーが DB（`matches`・`teams`）から描画する（URL からのスコア漏洩防止＋URL の安定性確保）。既存 match/result 型のクエリ方式は変更しない（後方互換）
- サイズ: portrait = **1080×1920**（9:16、Stories 共有と全画面ビューアー兼用）、landscape = 1200×630（ホームカードのサムネイルは portrait を縮小表示するため、landscape は共有プレビューと将来の Web 表示用）
- デザイン: 対戦カード（チーム名 name_ja・旗/short_code）、Item タイプラベル、result のみスコア、下部に Tryline ワードマーク＋`trylinerugby.com`。配色はサイトのトークン（`app/globals.css` の `--color-*`）と整合。**preview / recap の画像にはスコアを一切描画しない**
- `v` パラメータ = 該当 Item の published_at epoch。`Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` を付け、内容更新時は v が変わることでキャッシュバスト（URL 安定性: 同一 v なら同一画像）
- フォールバック: match が見つからない・描画データ不足の場合も **500 にせず**、汎用ブランドカード（ロゴ＋「Tryline」）を 200 で返す（share sheet や `<img>` の失敗を防ぐ）
- コスト: LLM 呼び出し**ゼロ**（@vercel/og のランタイム描画のみ）。CDN キャッシュ前提で Vercel compute は週あたり試合数×タイプ数×2 向き ≈ 100 レンダリング程度が上限。Supabase egress への影響は軽微（DB 読みはメタデータのみ）だが、直近の egress 事故を踏まえ受け入れ条件でキャッシュヘッダを検証する

## 12. Premium・認証・spoiler guard

- stories レスポンスは**ユーザー非依存**にする（試合単位キャッシュの不変条件を維持し CDN に乗せるため）。`premium_required` は「recap がペイウォール分割を持つか」をユーザーと無関係に示すフラグとし、iOS は既存の `/api/v1/me` の `isPremium` と組み合わせて表示を決める
- **locked 本文をレスポンスに含めない**: recap Item の summary は `splitRecapForPaywall().freeMd` のみから生成（既存 content エンドポイントと同じサーバー側ゲート）。サンプル試合（`isSampleMatch`）は premium_required=false
- locked（premium_required かつ非 Premium）の Item 表示: タイトル＋無料要約＋「続きは Premium で読めます。契約済みの方はログイン」の案内のみ。**価格・購入ボタン・Web 購入リンク・購読勧誘文言を置かない**（IAP なし、審査 3.1.1）。タップで試合詳細（既存のログイン導線がある画面）へ遷移
- spoiler guard: §8 のとおり既存機構（SecureStore 設定＋revealedMatchIds）に接続。ビューアー独自の開示状態・設定を新設しない

## 13. キャッシュ・既読管理

- API: CDN キャッシュ（§10）。iOS は既存 TanStack Query で calendar と同等の staleTime
- 画像: OS の URL キャッシュ＋`v` パラメータ。アプリ独自の画像キャッシュ層は作らない
- 既読（v1 は**端末ローカルのみ**・アカウント同期しない）:
  - SecureStore キー `tryline.stories.seen.<week_from>` に既読 Item id の JSON 配列
  - 読み込み時に当週・前週以外のキーを削除（肥大防止。SecureStore の値サイズ制約対策）
  - Item が更新されても id（match:type）は不変なので**既読のまま**とする（再生成のたびに未読へ戻すと再生成運用でバッジが荒れる）。新タイプの Item 追加時は新 id なので自然に未読になる
  - 未読数 = その試合の items のうち seen にない件数

## 14. エラー・空状態・フォールバック

| 状況 | 挙動 |
|---|---|
| stories API 失敗 | セクションに既存 `ErrorState`（リトライ付き）のコンパクト版。ホーム全体は壊さない |
| 対象試合 0 件 | セクション自体を非表示 |
| 画像取得失敗（個別） | Item はタイトル・要約のテキスト表示＋ブランド背景色で成立させる（画像必須にしない）。共有は画像なし・URL のみに縮退 |
| ビューアー表示中の通信断 | 取得済み Item はそのまま閲覧可。未取得画像は上記フォールバック |
| 試合が多すぎる週 | 上限 12 試合（kickoff 昇順で打ち切り）。超過分はホームの通常カレンダーで補完 |

## 15. アクセシビリティ

- 全タップ領域 44×44pt 以上
- VoiceOver: 自動送り停止、Item ごとに accessibilityLabel（タイトル・要約・「N 件中 M 件目」）、閉じる/共有/詳細ボタンにラベル
- Reduce Motion: 自動送り無効・スライド遷移をフェードに置換（`AccessibilityInfo.isReduceMotionEnabled`）
- マスク画面: 「スコアは非表示です。タップして表示」（既存 `ScoreText` の文言と統一）

## 16. Analytics（v1 は追加しない・推奨）

- 制約: アプリに計測基盤がなく、SDK 追加は設計条件（仕様にない依存パッケージ禁止）と衝突。first-party 計測 API の新設は v1 スコープを超える
- v1 の代替: (1) 共有 URL に `?utm_source=app&utm_medium=story_share` を付与し GA4（Web 側）で流入計測、(2) `/api/v1/stories` と `type=story` 画像のリクエスト数を Vercel ログで把握
- Phase 2 で `POST /api/v1/events`（匿名・バッチ送信）の first-party 計測を別 spec として検討（ホームカード表示/タップ、Item 閲覧率・完読率、次試合継続率、記事遷移率、共有開始）。共有「完了」は iOS の仕様上取得が不安定（UIActivityViewController の completion は共有先により信頼できない）ため、共有シート起動までを KPI とする

## 17. Phase 1〜3 の導入計画

| Phase | 内容 | 前提 |
|---|---|---|
| 1 | preview / result / recap。stories API・story 画像・ホームセクション・ビューアー・共有・ローカル既読 | なし（本 spec） |
| 2 | lineup（メンバー発表）・キックオフ直前情報（broadcasts 連動）・過去週アーカイブ UI・first-party 計測 | lineup は取り込み拡充 spec の解消後。MOM は**データ化 spec（未起票）が先** |
| 3 | 編集者が任意に追加する試合ニュース（`match_news` テーブル導入）・汎用 `news` タイプ・外部メディア連携 | 外部メディアは著作権・robots.txt 検証タスク（2026-07-15 保留分）の完了が前提 |

## 18. テスト方針

- Web（tryline）: stories 集約のユニットテスト（掲載条件・並び順・summary 導出・postponed/cancelled・premium_required・サンプル試合）、route のパラメータ検証テスト（calendar のテストを踏襲）、og story 型のスナップショット（portrait サイズ・フォールバック・Cache-Control）
- iOS（tryline-mobile）: 既存 Jest 構成で、集約データ→セクション表示のコンポーネントテスト、spoiler マスク時に result/recap 画像 URL を fetch しないことの検証、既読ストアのプルーニングのユニットテスト、未知 type 読み飛ばしのテスト
- 実機確認（Owner）: ビューアー操作一式・共有シート・Instagram Stories への実共有・VoiceOver/Reduce Motion

## 19. 受け入れ条件（Phase 1）

**Web（tryline）**
1. `GET /api/v1/stories`（パラメータなし）が今週（JST 月〜日）の `V1StoriesData` を `ApiEnvelope` で返し、Item が 0 件の試合は `matches` に含まれない
2. preview のみ存在する scheduled 試合 → items = [preview] の 1 件。finished かつ両スコアあり＋recap published → preview(あれば)・result・recap がこの固定順で返る
3. `status='cancelled'` の試合は matches に含まれない。`postponed` は preview があるときのみ preview 1 件で含まれる
4. recap Item の summary に `splitRecapForPaywall().lockedMd` 由来の文字列が含まれない（テストで locked 部分の固有文字列が漏れないことを検証）
5. ペイウォール分割を持つ recap の Item は `premium_required: true`、サンプル試合は false
6. result / recap の Item は `contains_result: true`、preview は false
7. レスポンスに Authorization 有無で差分がない（同一入力で byte 一致）こと、および calendar と同等の public Cache-Control が付くこと
8. `GET /api/og?type=story&match=<id>&item=result&orientation=portrait` が 1080×1920 の画像を返し、Cache-Control に `s-maxage` を含む。存在しない match でも 200 の汎用ブランドカードを返す
9. preview / recap の story 画像出力にスコア数字が含まれない（result のみスコア描画）
10. story 型の画像 URL のクエリに match UUID・item・orientation・v 以外（チーム名・スコア等）が不要である
11. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

**iOS（tryline-mobile）**
12. ホームにマッチストーリーズ横スクロールが表示され、Item 0 件の週はセクションごと非表示
13. ビューアーで タップ送り/戻し・試合間スワイプ・下スワイプで閉じる・最終 Item から次試合への遷移が動作する（コンポーネントテスト＋実機確認）
14. spoilerGuard ON・未開示の finished 試合で result/recap がマスクされ、**マスク中は該当画像 URL への fetch が発生しない**（テストで検証）。開示すると `revealedMatchIds` 経由で試合詳細・カレンダーのマスクも解除される
15. locked recap Item に価格・購入導線・購読勧誘文言が表示されない（表示されるのはログイン案内のみ）。**デザインは Owner 実機目視で承認を得る**（トークン準拠・編集紙面路線・テンプレ感の排除。機械的条件だけで完了としない）
16. 共有シートに portrait 画像＋`utm_source=app&utm_medium=story_share` 付き試合 URL が渡る。画像取得失敗時は URL のみに縮退
17. 既読が SecureStore に永続化され、アプリ再起動後も維持。当週・前週以外のキーが削除される
18. 未知の Story Item type を含むレスポンスでもクラッシュせず該当 Item だけ読み飛ばす
19. 新規依存パッケージが package.json に追加されていない
20. `typecheck` / `lint` / `test` が通る

## 20. 決定事項（2026-07-17 Owner 承認・全て推奨案で確定）とリスク

1. **自動送り = あり**（進行バー付き、長押し停止、Reduce Motion/VoiceOver で無効）
2. **共有の基本形 = 画像＋URL 同時**（Stories への共有はシート経由の画像共有であり、リンクスタンプは手動になる点は了解済み）
3. **既読は Item 更新で未読に戻さない**（§13 の理由。新タイプ追加時のみ新 id で自然に未読化）
4. **1 週の表示上限 = 12 試合**（NC＋クラブ大会が重なる週の実数確認は実装時に DB で検証し、明らかに不足するなら Owner に報告）
5. **過去週アーカイブ = v1 なし**（API は from/to 対応済み。UI は将来判断）
6. **計測 = v1 なし＋UTM 代替**（§16）。first-party events API は Phase 2 の別 spec 候補

**リスク（実装時の注意）**: (a) portrait 画像の日本語フォント読み込みが @vercel/og のサイズ制限に当たる可能性（既存 OG のフォント読み込み方式を流用して検証）。(b) 全画面モーダルのジェスチャ競合（スワイプ閉じる vs 試合間スワイプ）は実装時に実機調整が必要。(c) result の published_at に `matches.updated_at` を使うため、無関係な行更新で時刻がずれる（表示専用なので許容。厳密化は Phase 2）
