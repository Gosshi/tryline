export type NotablePlayer = {
  en: string;
  ja: string;
};

export const NOTABLE_PLAYERS_BY_TEAM: Record<string, NotablePlayer[]> = {
  コベルコ神戸スティーラーズ: [
    { en: "BrodieRetallick", ja: "ブロディレタリック" },
    { en: "ArdieSavea", ja: "アーディサベア" },
    { en: "AntonLienertBrown", ja: "アントンリネルトブラウン" },
  ],
  "クボタスピアーズ船橋・東京ベイ": [
    { en: "BernardFoley", ja: "バーナードフォーリー" },
  ],
  埼玉パナソニックワイルドナイツ: [
    { en: "MalcolmMarx", ja: "マルコムマークス" },
  ],
  東京サントリーサンゴリアス: [
    { en: "CheslinKolbe", ja: "チェスリンコルビ" },
    { en: "ShogoNakano", ja: "中野将伍" },
  ],
};

export function getNotablePlayers(teamName: string): NotablePlayer[] {
  return NOTABLE_PLAYERS_BY_TEAM[teamName] ?? [];
}