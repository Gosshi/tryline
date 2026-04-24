# 試合コンテンツ表示（p1-match-content-display）

## 背景

`p1-content-pipeline.md`（D010）によりコンテンツ生成パイプラインは実装済みで、`match_content` テーブルに `status = 'published'` の行が保存されます。一方、試合詳細ページ `/matches/[id]` は `p1-match-pages.md` 実装時点で `ContentPlaceholder` のみを表示する状態にとどまっており、パイプラインの成果物が UI に出ていません。Owner が生成品質を目視で検証できず、ローンチ前の品質改善サイクルが回せない状態です。

本仕様書は、`/matches/[id]` の `ContentPlaceholder` を `match_content.status = 'published'` の実コンテンツ表示に差し替えることを対象にします。パイプラインの動作・スケジューリングには手を入れません。

## スコープ

対象:
- `/matches/[id]` から `match_content` を anon クライアント + RLS（既存ポリシー `status = 'published'` 公開）で読む
- プレビュー / レビューの 2 スロットを Markdown レンダリング
- プレビュー / レビューが未公開の場合、試合ステータスとキックオフ時刻から文脈依存のプレースホルダー文言を出し分け
- プレビューが `published` の場合、`<meta name="description">` を本文冒頭から生成（SEO）
- LLM 出力に含まれる可能性のある HTML / スクリプトの XSS 防止（`rehype-raw` を使わない、素朴な Markdown のみ許可）
- 新規コンポーネント `<MatchContent>` と、既存 `<ContentPlaceholder>` の文言拡張
- `getPublishedContentForMatch(matchId)` の追加
- 単体テスト（Markdown レンダリング、XSS サニタイズ、プレースホルダー状態遷移）

対象外:
- `match_content.content_type = 'tactical_notes'` の表示（`p1-content-pipeline.md` のスキーマに check 値として存在するが、パイプラインは preview / recap のみ生成中）
- パイプラインの起動・スケジューリング（`p1-pipeline-scheduling.md` で後続）
- 管理画面 / 手動再生成 UI
- 生成コンテンツの編集 UI
- コメント・リアクション機能
- OGP 画像生成・Twitter カード
- コンテンツの多言語化
- `qa_scores` / `model_version` / `prompt_version` の UI 表示（デバッグ情報は非公開）
- 認証・プラン別の表示切替（Premium ゲート等）。本 PR では全コンテンツ anon 閲覧可
- リアルタイム更新（試合中の再 fetch）
- `generated_at` の詳細タイムスタンプ表示（`<time>` 要素での埋め込みのみ）

## データモデル変更

**なし**。`match_content` は `p1-content-pipeline.md` で作成済み、RLS ポリシー `published match content is publicly readable`（`status = 'published'` の anon / authenticated select 許可）も既存。

## API サーフェス

本仕様書では HTTP API を追加しない。Supabase anon クライアントでの直接 read のみ。

### データクエリ（`lib/db/queries/match-content.ts`、新規）

```typescript
export type PublishedMatchContent = {
  contentType: 'preview' | 'recap';
  contentMdJa: string;
  generatedAt: string;           // ISO UTC
  modelVersion: string;
  promptVersion: string;
};

export type PublishedMatchContentBundle = {
  preview: PublishedMatchContent | null;
  recap: PublishedMatchContent | null;
};

export async function getPublishedContentForMatch(
  matchId: string
): Promise<PublishedMatchContentBundle>;
```

実装要件:
- `getSupabasePublicServerClient()` を使用（`lib/db/public-server.ts`、既存）
- `match_content` を `match_id = matchId AND content_type in ('preview', 'recap')` で select
- RLS により `status = 'published'` 以外の行は返らない。アプリ側で明示的に `status` を filter する必要はないが、将来のポリシー変更に備えて **query 側でも `.eq('status', 'published')` を明記する**（二重防御）
- `tactical_notes` は本 PR の対象外。select 時に content_type 側で除外
- 行が無ければ該当スロットは `null`
- 0 行 / 1 行 / 2 行のいずれでも正常動作すること

## UI サーフェス

### ページ構造（`app/matches/[id]/page.tsx` の改修）

既存の 2 連 `<ContentPlaceholder>` を以下に差し替え:

```tsx
<section className="space-y-4">
  <MatchContentSection
    contentType="preview"
    content={publishedContent.preview}
    match={match}
  />
  <MatchContentSection
    contentType="recap"
    content={publishedContent.recap}
    match={match}
  />
</section>
```

`publishedContent` は `getPublishedContentForMatch(match.id)` の返り値。既存 `getMatchById` 呼び出しと**並列**で fetch する（`Promise.all`）。

### `<MatchContentSection>`（新規、`components/match-content-section.tsx`）

props:
```typescript
type Props = {
  contentType: 'preview' | 'recap';
  content: PublishedMatchContent | null;
  match: MatchDetail;
};
```

内部ロジック:
1. `content` が `null` でない → `<MatchContent content={content} contentType={contentType} />`
2. `content` が `null` → `<ContentPlaceholder type={contentType} state={...} />`
   - `state` は後述の `deriveContentState(contentType, match, now)` で算出

セクション全体の枠（タイトル `プレビュー` / `レビュー`、`<Card>`、`<h3>` 見出し）は `<MatchContentSection>` が持つ。`<MatchContent>` と `<ContentPlaceholder>` は中身のみを描画する子コンポーネント。

### `<MatchContent>`（新規、`components/match-content.tsx`）

props:
```typescript
type Props = {
  content: PublishedMatchContent;
  contentType: 'preview' | 'recap';
};
```

責務:
- `contentMdJa` を Markdown レンダリング
- 本文末尾に `<time dateTime={generatedAt}>` で JST フォーマットした生成日時を淡色で表示（例: `2027-02-04 23:12 JST 更新`）

Markdown レンダリング:
- `react-markdown` + `remark-gfm` を使用（RSC 互換）
- **`rehype-raw` は使用しない**（生 HTML 注入を遮断）
- 許可する構文: 見出し (h3-h6) / 段落 / 強調 / リスト / リンク / テーブル / 引用 / コード
- 独自スタイル: 見出しレベルを h1/h2 にしない（ページ全体の heading 階層を壊さないため、LLM 出力に `#` や `##` が含まれても CSS で表示調整、必要なら rehype プラグインで `h1 -> h3` に降格させる）
- 画像は本 PR では対応不要（LLM は画像を返さない前提、もし返しても `<img>` は react-markdown が描画するがサイズ制限 CSS だけ当てる）

### `<ContentPlaceholder>` の改修

既存 props `type: 'preview' | 'recap'` に加えて `state` を追加:

```typescript
type Props = {
  type: 'preview' | 'recap';
  state: 'pre_window' | 'preparing' | 'unavailable';
};
```

表示文言マトリクス:

| type × state | 文言 |
|---|---|
| preview × pre_window | "プレビューは試合開始 48 時間前に公開予定" |
| preview × preparing | "プレビューを準備中です" |
| preview × unavailable | "このプレビューは公開されませんでした" |
| recap × pre_window | "レビューは試合終了 1 時間後に公開予定" |
| recap × preparing | "レビューを準備中です" |
| recap × unavailable | "このレビューは公開されませんでした" |

視覚仕様（既存を踏襲）: dashed border の `<Card>`、`text-muted-foreground` / 淡色背景。

### 状態遷移ヘルパー（`lib/match-content/state.ts`、新規）

```typescript
export type ContentDisplayState = 'pre_window' | 'preparing' | 'unavailable';

export function deriveContentState(params: {
  contentType: 'preview' | 'recap';
  matchStatus: MatchStatus;
  kickoffAt: Date;
  now: Date;
}): ContentDisplayState;
```

判定ロジック:

**プレビュー**:
- `matchStatus in ('postponed', 'cancelled')` → `unavailable`
- `matchStatus === 'scheduled'` かつ `now < kickoffAt - 48h` → `pre_window`
- それ以外（`scheduled` で T-48h 以内、`in_progress`、`finished`） → `preparing`

**レビュー**:
- `matchStatus in ('postponed', 'cancelled')` → `unavailable`
- `matchStatus in ('scheduled', 'in_progress')` → `pre_window`
- `matchStatus === 'finished'` → `preparing`

「行が無い」のが「pipeline 未実行」か「pipeline が reject で draft 保存」かは anon からは区別できないため、両者とも `preparing` に倒す。Owner 側は Supabase Studio で確認する運用（`pipeline_runs` / `match_content.status` を見る）。

`finished` 状態で長期間 `preparing` が続く試合がもし出たら、`unavailable` に降格させる改善を後続 PR で検討。本 PR では時間経過による降格はしない（時計依存のロジックは testability が悪いため最小化）。

### メタデータ（`generateMetadata`）

既存の `title` 設定に加えて、プレビューが `published` の場合は `description` を本文冒頭から生成:

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [match, content] = await Promise.all([
    getMatchById(id),
    getPublishedContentForMatch(id),
  ]);

  if (!match) {
    return { title: 'Match Not Found - Tryline' };
  }

  const title = `${match.homeTeam.name} vs ${match.awayTeam.name} - Tryline`;

  if (content.preview) {
    return {
      title,
      description: extractDescription(content.preview.contentMdJa),
    };
  }

  return { title };
}
```

`extractDescription(md)`（`lib/match-content/description.ts` に配置）:
- Markdown 記法（`#`、`*`、`_`、`[text](url)` 等）を除去してプレーンテキスト化
- 先頭 120 文字で切り、末尾に `…` を付与
- 改行は空白に置換
- 実装は `remark` + `remark-strip-markdown` ではなく、単純な正規表現置換で十分（依存追加を避ける）

## LLM 連携

なし（表示のみ）。ただし:
- Markdown レンダラの設定で LLM 出力の **生 HTML 注入を遮断**すること（`rehype-raw` を有効化しない）は、`CLAUDE.md` の「スクレイプした生テキストは決して再配信しない」設計不変条件の系として必須
- LLM は素の Markdown を返す前提。HTML タグが混入していても表示時は escape される

## テスト戦略

- `tests/match-content/state.test.ts`
  - `deriveContentState` の全組み合わせ（type 2 × matchStatus 5 × 時刻前後）をテーブル駆動で検証
- `tests/components/match-content.test.tsx`
  - 既知の Markdown 入力（見出し・リスト・テーブル・リンク）が期待どおり HTML に変換される
  - `<script>alert('x')</script>` が含まれる Markdown → 実行可能な script にならない（`rehype-raw` 不使用の前提確認）
  - `generatedAt` が JST でフォーマットされて表示される
- `tests/components/match-content-section.test.tsx`
  - `content != null` → `<MatchContent>` がレンダリングされる
  - `content == null` かつ各 `state` → `<ContentPlaceholder>` が期待文言を出す
- `tests/components/content-placeholder.test.tsx`（既存 `status-badge.test.tsx` パターン踏襲）
  - 6 通り（type × state）すべての文言
- `tests/match-content/description.test.ts`
  - Markdown → 120 字 plain text 変換
  - 120 字以下は `…` を付けない
  - 120 字超は末尾 `…`
  - `#`、`*`、`[text](url)` 等の除去

`getPublishedContentForMatch` 自体のクエリは shape 正しいことを型レベルで保証し、ランタイムテストは本 PR では書かない（既存 `lib/db/queries/matches.ts` と同方針）。

## 依存パッケージ

追加:
- `react-markdown` — Markdown → React 要素
- `remark-gfm` — テーブル・打ち消し線・タスクリスト

追加しない:
- `rehype-raw`（XSS 経路になるため意図的に入れない）
- `rehype-sanitize`（`rehype-raw` を入れないため必須ではない。LLM 出力にタグが混入していても react-markdown が escape する）
- `marked` / `markdown-it`（`react-markdown` と重複）
- `dompurify`（ブラウザ依存、RSC と相性悪い）

## アクセシビリティ

- `<article>` で各コンテンツセクションをラップ
- 見出しは `<h3>`（ページ全体は h1 → h2 → h3 の階層）
- `<time dateTime={ISO}>` で生成日時を埋め込み
- テーブル（LLM が出力する可能性あり）には `<caption>` を LLM プロンプト側で指示する将来改善は別 PR

## パフォーマンス / キャッシュ

- `/matches/[id]` の `revalidate = 60` は既存のまま（本 PR では変更なし）
- `getMatchById` と `getPublishedContentForMatch` を `Promise.all` で並列化し、合計ラウンドトリップを 1 本にする
- `react-markdown` の Tree shake 対象は RSC バンドルに乗るため、クライアントバンドルへの影響なし

## 受け入れ条件

- [ ] `/matches/[id]` で `match_content.status = 'published'` の preview / recap がある場合、それぞれ Markdown レンダリングされる
- [ ] `match_content` に行が無い場合、既存のプレースホルダーと同じ視覚仕様でコンテキスト依存の文言が表示される
- [ ] プレビューの `pre_window` / `preparing` / `unavailable` 各状態で適切な文言が出る
- [ ] レビューの `pre_window` / `preparing` / `unavailable` 各状態で適切な文言が出る
- [ ] `<meta name="description">` が preview 公開済み試合で本文冒頭 120 字から生成される
- [ ] LLM 出力に `<script>` が含まれていても実行可能な DOM に挿入されない（`rehype-raw` 不使用）
- [ ] `generated_at` が JST でフォーマットされて表示される（例: `2027-02-04 23:12 JST 更新`）
- [ ] `getMatchById` と `getPublishedContentForMatch` が `Promise.all` で並列 fetch される
- [ ] `getPublishedContentForMatch` は query 側で `.eq('status', 'published')` を明記している（二重防御）
- [ ] `match_content.status = 'draft'` / `'rejected'` の行は anon クライアントから **RLS で遮断**され、ページに漏れない
- [ ] 既存の `/matches/[id]` の他要素（MatchHeader、戻るリンク等）と 404 挙動、`revalidate = 60` は変更なし
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 単体テスト（上記「テスト戦略」の 5 ファイル）が全て成功
- [ ] モバイル（360px）とデスクトップ（1280px）の両方でレイアウトが崩れない
- [ ] 本 PR で `match_content` のスキーマ・RLS ポリシーを変更していない

## 未解決の質問

1. `finished` 状態で長期間 recap が `preparing` のまま残った試合の扱い（時計依存の降格ロジック）は本 PR で入れるか、後続 PR に回すか — **本 PR では後続に回す**（時刻依存ロジックは test が複雑化するため最小化）
2. LLM が Markdown に `<img>` / 外部リンクを埋め込んだ場合の扱い — 本 PR では `react-markdown` のデフォルト挙動（リンクは `<a>`、画像は `<img>`）で表示。画像サイズ制限 CSS のみ当てる。`target="_blank"` / `rel="noopener"` の付与は次段階で検討
3. 本文末尾の「更新日時」表記は「生成日時（`generated_at`）」で十分か、「QA スコア」等のデバッグ指標を管理用に軽く出すか — 本 PR ではユーザー向けのため **生成日時のみ**。デバッグ指標は Supabase Studio 経由で Owner が見る
