# トップの「INTRODUCTION FILM」に紹介動画を入れる

## 背景

D037 の刷新で、トップ最上部の右側に紹介動画の枠（`app/page.tsx` の `figure.tl-introduction-poster`、4:3、線画と「現在は静止ポスター」の表示）を作った。2026-10-05 に Claude Code が刷新後の Web と iOS アプリの実画面で紹介動画を作り、Owner が内容を確認して「サイトに埋め込む」と決めた。

素材（Claude Code が作成。リポジトリには未コミット）:
- `docs/notes/promo-video-2026-10-05/tryline-promo-720p-hero.mp4`（1280×720、31.5 秒、H.264、音声なし、約 1.2 MB、`+faststart` 済み）
- `docs/notes/promo-video-2026-10-05/tryline-promo-poster.jpg`（1280×720、動画の 1.8 秒目＝タイトル「● Tryline 海外ラグビーを、日本語で。」）

全体 spec `specs/feat-touchline-redesign-web.md` の PR 3（動き）で、この枠について「本物の動画に置き換える際は、最初からポスターと領域の寸法を確保し、動画の取得・再生が見出しと日程の表示を待たせないこと。スマホと Reduce Motion はポスターのみとし、動画ソース自体も付与しない」と決めてある。

## スコープ

対象: `app/page.tsx` の紹介動画の枠、動画とポスターのファイル（`public/videos/`）、必要なら小さな client の部品。

対象外: トップのそれ以外の配置・動き、X 用の 1080p 版（リポジトリに入れない）、動画の中身の作り直し。

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

1. ファイル: 上の 2 つを `public/videos/tryline-promo-720p.mp4` と `public/videos/tryline-promo-poster.jpg` にコピーしてコミットする（合計約 1.2 MB）。`docs/notes/promo-video-2026-10-05/` の元ファイルはコミットしない。
2. 枠の比率を 4:3 から **16:9**（`aspect-video`）に変える。動画を切り抜かない（`object-fit: contain` か、枠を 16:9 にして `cover` でも欠けないこと）。最上部の見出し・ボタンとの配置が崩れないよう、必要なら枠の幅を調整する（1440 / 1024 / 390 で確認）。
3. 中身:
   - サーバーの HTML では**ポスター画像だけ**を出す（`<video>` の `poster` か `<img>`。幅と高さを明示し、`loading="lazy"` にはしない。LCP の候補にしないため `fetchpriority` は付けない）。
   - **画面幅 701px 以上**かつ **`prefers-reduced-motion: reduce` でない**ときだけ、ページの読み込み後（`load` の後、または枠が表示領域に入った後）に JS で `<video>` の `src` を付けて再生を始める。`muted` / `playsInline` / `loop` / `autoplay`。`preload="none"` から始める。
   - 700px 以下と Reduce Motion ではポスターのまま。動画のファイルを**取得しない**（`src` を付けない）。
   - **一時停止・再生のボタン**を枠の中に置く（5 秒を超えて自動で動く内容には止める手段が必要。WCAG 2.2.2）。ボタンは `aria-pressed` か文言の切り替えで状態を示す。
   - 動画の読み込みに失敗したらポスターのまま（エラーを画面に出さない）。
4. 文言: 枠の下の「15–30秒 / 音なし・ループ予定 / 現在は静止ポスター」は削除し、「INTRODUCTION FILM」と「サイトとアプリの紹介（音なし）」にする。`figure` の `aria-label` は「Tryline の紹介動画」。
5. 計測: 今ある `cta_id` は変えない。再生ボタンに新しい計測は付けない。

## LLM 連携

なし。

## 受け入れ条件

1. 1440×900 で、動画が自動で流れ、ループし、一時停止ボタンで止まる（Playwright で `video.paused` を確認）。
2. 390×844 と、1440×900 の `reducedMotion: "reduce"` では、`video` の `src` が空で、ネットワークに `tryline-promo-720p.mp4` へのリクエストが無い（Playwright の `page.on('request')` で確認）。
3. JavaScript 無効でもポスターが表示され、枠の大きさが確保されている。
4. 性能: `specs/feat-touchline-redesign-web.md` の「測り方 A」で、トップの LCP と CLS を本番（この PR の前）とプレビューで測り、PR 本文に貼る。CLS が 0.1 を超えたら、または LCP が本番より 0.5 秒以上悪化したら、マージせず Owner に報告する。
5. 既存の `cta_id` の集合が変わらない（同 spec の受け入れ条件 3 のコマンド）。
6. 新しいテスト: 幅 700px 以下・Reduce Motion で `src` を付けないこと、幅 701px 以上で付けること（関数に切り出してテストしてよい）。
7. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。
8. スクリーンショット（1440 / 1024 / 390）を PR 本文に貼る。Owner が見てからマージする。

## 未解決の質問

- なし。

## 2026-10-05 追記（Owner 指摘「動画が小さすぎて見づらい」）

PR #919 のレビューで、デスクトップの枠が幅約 390px しかなく中身が読めないと分かった。次を同じ PR で直す。
1. デスクトップ（1024px 以上）で枠を幅 640〜720px 程度に広げる。見出し・ボタン・動画が 1 画面目に収まること。
2. 「拡大して見る」ボタンで、ダイアログに動画をコントロール付きで大きく再生する（音なし、Esc と閉じるボタン、フォーカス管理）。ダイアログの動画は開いたときにだけ `src` を付ける。
3. 「700px 以下と Reduce Motion では動画を取得しない」を「**自動では取得しない（利用者が『拡大して見る』を押したときだけ取得する）**」に改める。700px 以下と Reduce Motion でも「拡大して見る」は出す。
