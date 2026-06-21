# Codex プロンプト — 競技ハブ/現行シーズンの索引促進

仕様: `specs/feat-seo-competition-indexing.md` を読んでから着手すること。要点と注意のみ記す。仕様本文は繰り返さない。

## やること（確定事項を反映済み）

1. **`components/competition-nav-dropdown.tsx`**: `HEADER_COMPETITIONS` の旧シーズン固定（six-nations/2025・rwc/2023・top-14/2024-25・rugby-championship/2025 等）をやめ、各 family を **bare ハブ `/c/<family>`** へリンクする。ラベルは**日本語/カタカナ**（`competitions.name_ja` を family 単位で引く、難しい総称は定数マップで補完）。開閉挙動・a11y・スタイルは不変。
   - RWC は family=`rwc` を1エントリ（`/c/rwc`）に集約してよい（現状 RWC2023/2027 の2エントリ）。RWC2027 へは RWC ハブ or 専用導線から辿れること。
2. **`app/c/[competition]/page.tsx`（bare ハブ）**: 現行シーズンページへの**目立つ内部リンク**を確保（ナビ→ハブ→現行シーズンでクロールが流れる）。既に十分なら変更不要だが、要確認。
3. **`app/c/rwc/2027/page.tsx`**: `title`/`description` を**日本語化**（例 title「ラグビーワールドカップ2027 日程・出場国・日本語ガイド」）。静的ページ構造・bracket 子ページは維持。動的テンプレへ移行しない。

## 触ってはいけないもの

- **match recap/preview ページに noindex を追加しない**（製品本体・sitemap は既に中身あり限定）。
- カタカナ命名の DB 変更（#395 済み）、h2h/round-hub のクロール整理（別フォローアップ）。
- 被リンク/権威まわり。

## 既存の利用先

- 最新シーズン解決が要る場合は既存 `listSeasonsByFamily`（`lib/db/queries/competitions`）。bare ハブの現行シーズン誘導/リダイレクトの既存挙動を確認して活かす。
- family→日本語名は `competitions.name_ja`。シーズン横断の family 総称ラベルが必要なら定数マップ。

## エッジケース

- ハブ `/c/<family>` がリダイレクトでなく実ページか確認（pnc/premiership は索引済みの実ハブ）。リダイレクトなら 301 先が現行シーズンになるよう注意。
- ナビは client component（`"use client"`）。`name_ja` をサーバ側で解決して props/定数で渡すか、family→日本語名の静的マップを持つ（DB 取得を client に持ち込まない）。
- RWC のように1 family に複数の注目シーズン（2023/2027）がある場合のラベル/リンク整理。

## 完了の定義

- 仕様「受け入れ条件」1〜6 を満たす。
- ナビのリンク先・日本語ラベルのテストを追加。a11y/開閉の回帰なし。
- 変更は `components/` と `app/c/` 配下中心。DB スキーマ・sitemap の match/player ロジックは変更しない。
- マージ・デプロイ後の URL 検査→インデックス登録リクエストは Owner 作業。
