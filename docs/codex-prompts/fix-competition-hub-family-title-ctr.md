`/specs/fix-competition-hub-family-title-ctr.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

**検索順位は取れています。落としているのはクリック率で、原因はタイトルが英語であることです。**

GSC 実測（2026-07-28〜08-24、`--dims page`）:

| URL                            | 表示 | クリック |      CTR | 順位 |
| ------------------------------ | ---: | -------: | -------: | ---: |
| `/c/pnc/2026`（シーズン）      |   79 |        6 | **7.6%** |  9.5 |
| `/c/pnc`（ファミリー）         |   88 |        1 | **1.1%** | 10.4 |
| `/c/premiership`（ファミリー） |  107 |        2 | **1.9%** |  9.7 |

**同一大会・同じ順位帯で CTR が7倍違います。** 本番の実タイトルを見ると理由は明白です。

```
/c/premiership          Premiership 順位表・日程・日本での視聴方法 | Tryline
/c/premiership/2026-27  プレミアシップ 2026-27 日程・見どころ | Tryline
```

**ファミリーページだけ大会名が英語です。** meta description は両方とも日本語なので、**タイトルだけの問題**です。

## 原因

同じ「ファミリーの表示名」にマップが**2つ**あります。

- `lib/format/competition.ts:67-82` `FAMILY_DISPLAY_NAMES` … **14件中11件が英語**
- `lib/format/japanese-names.ts:82-95` `JAPANESE_COMPETITION_NAMES_BY_FAMILY` … 全件日本語

ファミリーページ（`app/c/[competition]/page.tsx:53`）は `formatFamilyName()` を呼び、これが**英語側**を見ています。シーズンページは `getCompetitionDisplayName` 経由で日本語側を見ています。

## 直すのは1関数だけです

`formatFamilyName` の解決順序を日本語マップ優先にします。具体形は spec の「実装方針」にあります。そのまま使って構いません。

**`app/` 配下は1ファイルも変更しないでください。** 戻り値が変わるだけで、呼び出し元15箇所すべてが正しくなります。

## 必ず踏む落とし穴（ここが本題）

**2つのマップは収録キーが一致していません。**

| family                    | 英語マップ                  | 日本語マップ |
| ------------------------- | --------------------------- | ------------ |
| `lipovitan-challenge-cup` | リポビタンDチャレンジカップ | **無し**     |
| `puma-trophy`             | プーマ・トロフィー          | **無し**     |

この2つは**英語マップ側に日本語で入っています**。日本語マップへ単純に差し替えると、フォールバックが効かず `Lipovitan Challenge Cup` / `Puma Trophy` に退行します。

そのため:

- **`FAMILY_DISPLAY_NAMES` を削除しないでください。** この2件の唯一の供給源です
- 解決順序は **日本語マップ → `FAMILY_DISPLAY_NAMES` → タイトルケース** の3段にします
- 受け入れ条件6・7がこの退行を検出します

**`JAPANESE_COMPETITION_NAMES_BY_FAMILY` に2件を追加して解決しないでください。** このマップは `getCompetitionDisplayName` が `competitions.name_ja` のフォールバックに使う別責務のもので、取り込み側の定数と対応関係があります（DB を直しても取り込みで戻る経緯あり）。**今回はファミリー表示名の解決順序だけを変えます。**

2つのマップの統合もしないでください。責務が違います。

## 表示が変わることの確認

日本語名は英語名より長いものがあります（`URC` → `ユナイテッド・ラグビー・チャンピオンシップ` は23文字）。

**トップページの大会カード（`app/page.tsx:419,462,465`）と OG 画像（`createCompetitionOgImage` の `familyName`）で、折り返し・はみ出しが起きないか確認してください。** レイアウト崩れがあれば PR に明記してください（修正するかは別判断）。

## 既存テストは書き換えが必要です

`tests/format/competition.test.ts` は現在**英語を期待**しています（`"Pacific Nations Cup"` / `"Rugby World Cup"` 等）。これは仕様変更なので、**新しい期待値へ更新してください**。期待値を日本語に直すのが正しい対応です。

あわせて `lipovitan-challenge-cup` と `puma-trophy` のケースを**必ず残してください**（既存テストにあります。消さないこと）。

## 完了の定義

- spec の受け入れ条件1〜12をすべて満たす
- `app/` 配下の変更が**ゼロ**であること（`git diff --stat` で示せること）
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る

## PR に書いてほしいこと

1. `lipovitan-challenge-cup` と `puma-trophy` が日本語のままであることを、**どのテストが保証しているか**ケース名で示してください。ここが唯一の退行リスクです
2. 変更ファイル一覧に `app/` が含まれていないこと

---

# 修正依頼（2026-08-31・PR #744 レビュー）

**実装は spec どおりで、直すところはありません。** `formatFamilyName` の3段解決も、`FAMILY_DISPLAY_NAMES` の保持も、`lipovitan-challenge-cup` / `puma-trophy` の専用テストも正しく入っています。

**落ちているのは、私（spec 作成側）が更新対象として挙げ忘れた既存テスト7件です。** すべて「英語だった表示が日本語になった」ことによる期待値のズレで、**変更が正しく効いている証拠**です。期待値を日本語に更新してください。

なお最初の CI 失敗（9秒で fail）は `Setup Supabase CLI` の `rate limit exceeded` で、コードとは無関係のインフラ由来でした。再実行済みです。

## 落ちている7件（CI ログより）

| ファイル                                       | テスト名                                                                   | 原因                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tests/app/competition-guide-metadata.test.ts` | includes standings and viewing guidance in hub metadata                    | OG URL が `family_name=URC` を含むことを期待。日本語（URL エンコード済み）になった |
| `tests/app/competition-hub-indexing.test.tsx`  | uses local key visuals when an image is available                          | 画像 alt が `"Premiership"` → `"プレミアシップ"`                                   |
| 同上                                           | uses batch two local key visuals when available                            | 画像 alt が `"URC"` → `"ユナイテッド・ラグビー・チャンピオンシップ"`               |
| 同上                                           | uses the Nations Championship key visual when it is available              | 画像 alt が `"Nations Championship"` → `"ネーションズチャンピオンシップ"`          |
| `tests/app/home-page.test.tsx`                 | keeps the RWC archive card on 2023 while adding the 2027 schedule link     | `"Rugby World Cup"` → `"ラグビーワールドカップ"`                                   |
| `tests/app/season-page-ia.test.tsx`            | uses the family visual and derives the hero progress without another query | 画像 alt が `"Premiership"` → `"プレミアシップ"`                                   |
| 同上                                           | outputs season FAQ JSON-LD without changing breadcrumb JSON-LD             | パンくず JSON-LD の `name` が `"Premiership"` → `"プレミアシップ"`                 |

## 直し方

**期待値を日本語に更新してください。** 実装側を英語に戻す方向で直さないでください。

対応表（`JAPANESE_COMPETITION_NAMES_BY_FAMILY` が正）:

```
Premiership          → プレミアシップ
URC                  → ユナイテッド・ラグビー・チャンピオンシップ
Nations Championship → ネーションズチャンピオンシップ
Rugby World Cup      → ラグビーワールドカップ
```

**`competition-guide-metadata.test.ts` だけ注意**が要ります。OG 画像 URL のクエリ文字列は `URLSearchParams` で組まれる（`lib/seo/og-image.ts:38-40`）ため、日本語は**パーセントエンコードされます**。`family_name=ユナイテッド…` という生文字列では一致しません。

エンコード済み文字列を直接書くと読めないので、**デコードして比較する形にしてください**。例:

```ts
const url = new URL(ogImage.url, "https://example.com");
expect(url.searchParams.get("family_name")).toBe(
  "ユナイテッド・ラグビー・チャンピオンシップ",
);
```

`searchParams.get()` はデコード済みの値を返すので、意図が読める形で検証できます。

## レイアウトは確認済みです（対応不要）

PR 要件で挙げた OG 画像の折り返しは、**本番の `/api/og` に最長の日本語名を渡して実物を確認しました**（2026-08-31）。

```
/api/og?type=competition&family_name=ユナイテッド・ラグビー・チャンピオンシップ&accent=%2300823E
→ HTTP 200 / 1200x630 PNG
```

23文字が**2行に折り返して中央に収まり**、はみ出し・見切れはありませんでした。**OG 画像側の修正は不要です。**

トップページの大会カードについては、デプロイ後に Claude Code 側で実機確認します。こちらも対応不要です。

## 完了の定義（追加分）

- `pnpm test` が**全件パス**する
- **実装側（`lib/format/competition.ts`）は変更しない。** 直すのはテストの期待値だけ
- `app/` 配下の変更は引き続き**ゼロ**
