# fix-pricing-video-upload-date

> GPT-6 監査 A-5 pricing（P1）の `VideoObject` 部分。構造化データに実在しない日付が入っている。

## 背景

`app/pricing/page.tsx:76-86` の `VideoObject` に、**プレースホルダのままの日付**が入っている。

```ts
const pricingVideoJsonLd = {
  "@type": "VideoObject",
  embedUrl: "https://www.youtube.com/embed/2kFHgiaI-NA",
  name: "Tryline — ラグビー解説サービス紹介",
  thumbnailUrl: "https://img.youtube.com/vi/2kFHgiaI-NA/maxresdefault.jpg",
  uploadDate: "2025-01-01",     // ← 元日。実アップロード日ではない可能性が高い
};
```

`uploadDate` は `VideoObject` の**必須プロパティ**であり、検索エンジンへ送られる構造化データである。**誤った日付を宣言している状態が続くと、リッチリザルトの対象外になるか、誤った情報を配信することになる。**

監査の指摘（原文）: 「VideoObjectのuploadDate=2025-01-01は実アップロード日との照合が必要。」

`2025-01-01` は元日であり、実運用で動画を公開する日付としては不自然である。

**実アップロード日は `2026-05-18`**（2026-09-09、Owner が YouTube Studio で確認）。Claude Code は YouTube へ外部アクセスしていない（仕様書に明記されたスクレイピング対象ではないため）。**この値は Owner の確認によるものであり、推測ではない。**

日付は他の記録とも整合する。Phase 2 の大部分が実装済みになったのが 2026-05-13、GSC のデータ開始が 2026-05 以降である。

## スコープ

対象:
- `uploadDate` を実際の値にする
- 値の出所を追えるようにする
- テスト

対象外:
- 動画そのものの差し替え
- `VideoObject` の他のプロパティ（`name` / `description` / `thumbnailUrl` / `embedUrl`）
- **pricing ページの主張・実演の改善**。監査 A-5 pricing の「実演サンプルが弱い」は Owner 判断で、別項目
- `createPricingFaqJsonLd` などページ内の他の JSON-LD

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

なし。**構造化データのみ。画面表示は変わらない。**

## LLM 連携

なし。コスト $0。**LLM に「この動画はいつ公開されましたか」と尋ねない。** 検証できない日付を構造化データに入れることは、本 spec が直そうとしている問題そのものである。

## 変更詳細

`uploadDate` を `2025-01-01` から **`2026-05-18`** に変える。1 行の修正である。

**それが確認済みの実測値であることを、コード上のコメントまたは PR 本文から追えるようにすること。** 出所は「2026-09-09、Owner が YouTube Studio で確認」。次に見た人が、また仮置きの日付だと判断して書き換えないようにする。

## 受け入れ条件

1. `uploadDate` が **`2026-05-18`** になっている
2. **その日付の出所が PR 本文に書かれている**（2026-09-09、Owner が YouTube Studio で確認）
3. `VideoObject` の他のプロパティ（`name` / `description` / `thumbnailUrl` / `embedUrl`）に差分が無い
4. `uploadDate` が ISO 8601 の日付形式であることを検証するテストがある
5. **ページの他の JSON-LD（`createPricingFaqJsonLd` 等）が壊れていない**ことを検証するテストがある
6. 画面表示に差分が無い
7. LLM 呼び出しが差分に含まれない
8. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/app/` 配下（`exclude` 非該当。確認済み）。

## 未解決の質問

なし。**2026-09-09 に Owner から実アップロード日 `2026-05-18` の提供を受けて解消した。**

**本 spec で解決しないと明示するもの**:

- **これは 1 行の修正である。** pricing ページの説得力（A-5 pricing の本体）は別問題で、Owner 判断が要る
