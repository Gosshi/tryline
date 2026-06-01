# recap インデックス促進（IndexNow 即時送信 + sitemap lastmod の精度向上）

## 背景

2026-06-01 の評価（`docs/growth-playbook-2026-06.md` 施策 S2）で、recap 904件・sitemap 2,270 URL が存在するのに GSC 表示が3ヶ月で51回という「埋蔵資産」状態を確認した。主因は新規ドメインの権威不足（→ 被リンク施策 S3 で対応）だが、本仕様は **クロール／インデックスの遅延** という別レバーを攻める。狙いは「土日の試合 recap を、月曜朝の検索需要までに発見可能にする」こと。

打ち手は二本立て:

1. **IndexNow 即時送信**: recap が published になった瞬間に IndexNow API へ URL を通知する。Bing・Yandex・Seznam・Naver が即時クロールに使う。near-zero コスト。
2. **sitemap の per-URL `lastmod` 精度向上**: 現在 `app/sitemap.ts` は全 URL の `lastModified` を `new Date()`（sitemap 生成時刻）にしている。全 URL が「常に今変更された」と主張する弱い／ノイジーなシグナル。実際のコンテンツ更新時刻を入れれば、Google が「新しく変わった URL」を優先再クロールしやすくなる。

> **正直な前提（重要）**: **Google は IndexNow を採用していない。** IndexNow で即時に効くのは Bing/Yandex 等。日本の主検索エンジンは Google なので、Google 向けの実効レバーは「正確な sitemap lastmod」＋「被リンク（S3）」＋「GSC の URL 検査による手動インデックス依頼（Owner / 施策 O1）」である。Google Indexing API は公式には JobPosting / BroadcastEvent 限定で、一般ページへの利用はガイドライン違反のため **本仕様では採用しない**。

## スコープ

対象:
- `lib/seo/indexnow.ts`（新規） — IndexNow 送信ユーティリティ
- `public/<INDEXNOW_KEY>.txt`（新規） — IndexNow 鍵ファイル（公開ファイル）
- `lib/llm/pipeline.ts` — content が `published` で永続化された直後に IndexNow を fire-and-forget で呼ぶ
- `lib/db/queries/matches.ts` — `listMatchIdsWithContent` の戻り値に更新時刻を追加
- `app/sitemap.ts` — 試合 URL の `lastModified` を実コンテンツ更新時刻に差し替え

対象外:
- Google Indexing API（前述の理由で不採用）
- 被リンク施策（S3、手動）・GSC 手動インデックス依頼（O1、Owner）
- season/family/home/team/player ページの lastmod 精緻化（本仕様は試合 URL のみ。他は現状維持で可）

## データモデル変更

なし（既存の `match_content` の更新時刻カラムを読むのみ）。

> 確認事項: `match_content` の更新時刻に使えるカラム。`fix-seo-indexing.md` では `NewsArticle.datePublished` に `generated_at` を使う前提だった。本仕様の sitemap lastmod も同カラム（`generated_at`、存在すれば `updated_at`）を使う。Codex は実カラム名を `lib/db` の型定義で確認すること。

## API サーフェス

### IndexNow 鍵ファイル

`https://www.trylinerugby.com/<INDEXNOW_KEY>.txt` が鍵文字列そのもの（プレーンテキスト）を返す必要がある。`public/<INDEXNOW_KEY>.txt` に配置すれば Next.js が静的配信する。

> **鍵は秘密情報ではない**（IndexNow の仕様上、所有証明のため公開する）。CLAUDE.md の機密管理ルールには抵触しない。鍵文字列（英数 8〜128 文字、推奨は UUID）を生成し、(a) `public/<key>.txt` にその文字列を書き、(b) 同じ文字列を `lib/seo/indexnow.ts` の定数 or `INDEXNOW_KEY` 環境変数に置く。両者は一致させる。

### IndexNow 送信（外部通信）

唯一の外部宛先は `https://api.indexnow.org/indexnow`（POST, JSON）。これ以外への通信は行わない。

```jsonc
// POST https://api.indexnow.org/indexnow
{
  "host": "www.trylinerugby.com",
  "key": "<INDEXNOW_KEY>",
  "keyLocation": "https://www.trylinerugby.com/<INDEXNOW_KEY>.txt",
  "urlList": ["https://www.trylinerugby.com/matches/<id>"]
}
```

## 実装詳細

### 1. `lib/seo/indexnow.ts`（新規）

```typescript
import { SITE_URL } from "@/lib/site";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "";

// 失敗してもパイプラインを止めない。本番ホスト時のみ送信する。
export async function submitUrlsToIndexNow(urls: string[]): Promise<void> {
  if (!INDEXNOW_KEY || urls.length === 0) return;
  if (!SITE_URL.includes("trylinerugby.com")) return; // local/preview ではスキップ

  const host = new URL(SITE_URL).host;
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    if (!res.ok) {
      console.error("[indexnow] non-ok", res.status, await res.text());
    }
  } catch (error) {
    console.error("[indexnow] submit failed", error);
  }
}
```

### 2. `lib/llm/pipeline.ts` — published 時にフック

`persistedStatus` を決めて永続化している箇所（現状 L256 付近 `const persistedStatus = finalQa.verdict === "publish" ? "published" : "draft";`）の **永続化成功後** に、`published` の場合のみ IndexNow を呼ぶ。

```typescript
if (persistedStatus === "published") {
  const urls = [`${SITE_URL}/matches/${matchId}`];
  // league-one は EN ページも sitemap に載るため一緒に通知
  if (competitionFamily === "league-one") {
    urls.push(`${SITE_URL}/matches/${matchId}/en`);
  }
  await submitUrlsToIndexNow(urls); // 内部で try/catch 済み・失敗してもスローしない
}
```

- `competitionFamily` がこのスコープで取れない場合は、判定を省き JA URL のみ通知してもよい（EN は次回 sitemap 経由で拾われる）。Codex は既存の取得経路を確認して判断する。
- preview の published では通知しない（recap 公開＝検索需要が立つタイミングに絞る）。preview も通知したい場合は「未解決の質問」参照。

### 3. `lib/db/queries/matches.ts` — 更新時刻を返す

`listMatchIdsWithContent`（`fix-sitemap-content-only.md` で `SitemapMatch` を返すよう拡張済み）に `updatedAt: string`（`match_content` の `generated_at` / `updated_at`）を追加する。published 行の最新更新時刻を取る。

```typescript
// SitemapMatch を { id, competitionFamily, updatedAt } に拡張
```

### 4. `app/sitemap.ts` — 試合 URL の lastmod を実時刻に

**現状（全 URL 一律）:**
```typescript
const matchPages = matchIds.map((match) => ({
  changeFrequency: "weekly" as const,
  lastModified: new Date(),
  priority: 0.7,
  url: `${base}/matches/${match.id}`,
}));
```

**変更後:**
```typescript
const matchPages = matchIds.map((match) => ({
  changeFrequency: "weekly" as const,
  lastModified: new Date(match.updatedAt),
  priority: 0.7,
  url: `${base}/matches/${match.id}`,
}));
```

`enMatchPages` も同様に `match.updatedAt` を使う。season/family/home/team/player は現状維持で可。

## LLM 連携

なし（LLM 呼び出しは追加しない）。コスト増は IndexNow への HTTP POST のみ（無料）。

## 受け入れ条件

1. `https://www.trylinerugby.com/<INDEXNOW_KEY>.txt` が鍵文字列を返す（200・プレーンテキスト）。
2. recap が published になる経路（ローカル/ステージングで `generateMatchContent` を verdict=publish になるよう実行）で、`submitUrlsToIndexNow` が当該試合 URL を含めて呼ばれる（ログ or fetch モックで確認）。
3. IndexNow API がエラー（非200 / ネットワーク失敗）でも `generateMatchContent` は成功扱いで完了する（パイプラインを止めない）。
4. local/preview 環境（`SITE_URL` が trylinerugby.com を含まない）では IndexNow を送信しない。
5. `/sitemap.xml` の試合 URL の `<lastmod>` が一律でなく、コンテンツ更新時刻ごとに異なる値になっている。
6. `INDEXNOW_KEY` 未設定時は送信をスキップし、エラーを投げない。
7. `pnpm tsc --noEmit` と `pnpm build` が通る。

## 未解決の質問

- **鍵管理**: `public/<key>.txt` を git にコミットするか（推奨。鍵は非機密）、`INDEXNOW_KEY` 環境変数のみにするか。両立させるなら「env の鍵」と「コミットした txt の中身」を一致させる運用が必要。
- **preview も通知するか**: 現案は recap published のみ。preview 公開も検索価値があるなら対象に含める（試合前需要）。
- **再公開時の通知**: `p8-recap-version-bump.md` 等で recap を更新（再 published）した場合も IndexNow を打つか（推奨: status が published になる／更新されるたびに打つ）。
- **`match_content` の更新時刻カラム名**の確定（`generated_at` か `updated_at` か）。Codex が型定義で確認する。
- IndexNow は Bing/Yandex 中心で **Google には効かない** 点を Owner が理解した上で着手する（Google は S3 被リンク＋O1 GSC 手動依頼が本筋）。
