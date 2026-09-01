# Codex 指示書: 大会シーズンハブの日程節をサーバーレンダリングする

仕様書: `specs/fix-hub-schedule-server-rendering.md`

**先にこの spec を最後まで読んでから着手してください。**

## 着手条件（重要）

**`specs/fix-hub-preseason-standings-and-round-filter.md` が main にマージされてから始めてください。** 同じファイル（`components/season-match-groups.tsx`）を触ります。先にあちらが `ROUND_FILTERS` を廃止することで、`useSearchParams()` が必要な大会が3件（rwc/2023・rwc/2027・nations-championship/2026）に限定され、本作業が大幅に簡単になります。

## 一文で言うと

`/c/urc/2025-26` のサーバー HTML には試合リンクが **1本**しか無く、ブラウザで見ると **151本**あります。Bing 流入の86%が着地するページで、内部リンク150本と本文がインデックスされていません。

## 原因（調査済み。再調査不要）

`app/c/[competition]/[season]/page.tsx` は `revalidate = 3600` + `generateStaticParams()` で静的生成されます。その中の `<Suspense>`（`:823`、**`fallback` 未指定**）が `SeasonMatchGroups`（`"use client"` + `useSearchParams()`）を包んでいるため、Next.js がそのサブツリーのプリレンダをバイパスし、静的 HTML にはそこが空で出力されます。

`useSearchParams()` はラウンドフィルタ（`?round=`）のためだけに使われています。

## 決定的な事実

`/c/urc/2025-26` の HTML（291,750 バイト）には既に:

- 試合 UUID が **150件**（重複除去後）
- チーム名（`グラスゴー`）が **34回**

含まれています。**データは既に転送済みで、`<a href="/matches/...">` になっていないだけです。** サーバーレンダリングに切り替えても転送量はほとんど増えません。**「重くなるから」を理由に部分レンダリングへ逃げないでください。**

## 触るファイル

| ファイル | 何をするか |
|---|---|
| `components/season-match-groups.tsx` | サーバー／クライアントの分割。`useSearchParams()` を最小のクライアント境界へ押し込み、試合カードのツリーはサーバー側で生成する |
| `app/c/[competition]/[season]/page.tsx:823` | `<Suspense>` 境界の見直し。残すなら `fallback` を付ける |

行番号は 2026-08-31 時点。

## 絶対に守る制約

- **`export const revalidate = 3600` と `generateStaticParams()` を消さない**
- **`export const dynamic = "force-dynamic"` を追加しない**
- ハブを動的レンダリングに落とすと、過去に解消済みのキャッシュ MISS 問題（Server Component での無条件 `getUser()` に起因する `no-store` 化）と同種の劣化を招きます。**「動的にすれば SSR される」は却下済みの解法です**
- ビルドログで `/c/[competition]/[season]` が `ƒ`（Dynamic）に変わっていたら失敗です

## 正常に動いている参照実装

同じリポジトリ内に、日程を正しくサーバーレンダリングしている例が2つあります。**書き方を揃えてください。**

- `app/calendar/page.tsx` + `components/calendar/week-schedule.tsx`（サーバーコンポーネント、`useSearchParams` 不使用）
- `app/c/[competition]/[season]/round/[round]/page.tsx`（ラウンドハブ。実測で8件の試合リンクが HTML に出ている）

## 検証コマンド（そのまま使ってください）

```
curl -sL "<preview-url>/c/urc/2026-27"         | grep -oE 'href="/matches/[a-f0-9-]{36}"' | sort -u | wc -l   # 期待: 144 以上
curl -sL "<preview-url>/c/urc/2025-26"         | grep -oE 'href="/matches/[a-f0-9-]{36}"' | sort -u | wc -l   # 期待: 150 以上
curl -sL "<preview-url>/c/premiership/2026-27" | grep -oE 'href="/matches/[a-f0-9-]{36}"' | sort -u | wc -l   # 期待:  90 以上
curl -sL "<preview-url>/c/urc/2026-27"         | grep -oE '第[0-9]+節' | sort -u | wc -l                      # 期待: 18
curl -sL "<preview-url>/c/urc/2025-26"         | wc -c                                                        # 期待: 400000 未満
```

**ブラウザの DevTools で確認しても意味がありません。** ハイドレーション後は元から151件見えています。**必ず `curl` の生 HTML で判定してください。**

## 処理すべきエッジケース

1. **フィルタが必要な大会**（nations-championship/2026 等）でも試合カードが SSR されること。切り出しの結果、フィルタ対象大会だけ SSR が抜ける状態にしない
2. **折りたたまれている節の中身も HTML に出す。** 現行実装は既に `isOpen ? "grid ..." : "hidden"` で全カードを描画して CSS で隠しているので、この方針は挙動の維持です
3. `hidden` は `display:none` 相当であること（閉じた節がスクリーンリーダーに露出しない）
4. **ハイドレーション不一致を出さないこと。** `getDefaultOpenGroupIndexes` は `new Date()` を使うため、**サーバーとクライアントが異なる時刻を見て別の節を開くと mismatch になります。** ここが本作業で最も踏みやすい罠です

## 「完了」の定義

1. spec の受け入れ条件 18 項目を1件ずつ照合し、PR 本文にチェックリストで貼る
2. 上の `curl` コマンドの**実行結果をそのまま** PR 本文に貼る
3. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
4. ビルドログの該当ルートの記号（`●` / `ƒ`）を PR 本文に貼る
5. `/c/urc/2026-27` と `/c/urc/2025-26` のデスクトップ幅 **1440** のスクリーンショットを変更前後で並べ、見た目の差分がゼロであることを示す
6. ブラウザコンソールに hydration 関連の警告が出ていないことを確認する

## やってはいけないこと

- ルートを動的レンダリングに変える
- 折りたたみの既定挙動（何節を開くか）を変える
- 試合カードの見た目を変える
- `/c/rwc/2027` を直す（**同じ問題があるかだけ調べて PR 本文で報告してください**）
- スコープ外の「デスクトップの情報密度」に着手する
