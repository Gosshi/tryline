# 紹介動画のソース（Remotion）

`tryline-promo-1080p.mp4` を作った Remotion のソース。拡張子に `.txt` を付けて保存している。
`tsconfig.json` が `**/*.ts(x)` を含むため、そのままの拡張子だと `remotion` が無いので型チェックと Next のビルドが失敗する。

使うときは別のディレクトリにコピーし、`.txt` を外して `remotion` を入れる。
mp4（8MB）はリポジトリに入れていない。
