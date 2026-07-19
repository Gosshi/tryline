type TeamIdentity = {
  color: string;
  flag: string;
};

const TEAM_FLAGS: Record<string, string> = {
  argentina:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h512v342H0z"/><path fill="#338AF3" d="M0 0h512v114H0zM0 228h512v114H0z"/><circle fill="#FFDA44" stroke="#d6ab00" stroke-width="5" cx="256.5" cy="171" r="40"/></svg>',
  australia:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#00008b" d="M0 0h513v342H0z"/><g fill="#FFF"><path d="m188 212.6 11 22.9 24.7-5.7-11 22.8 19.9 15.8-24.8 5.6.1 25.4-19.9-15.9-19.8 15.9.1-25.4-24.8-5.6 19.9-15.8-11.1-22.8 24.8 5.7zM385.9 241.1l5.2 10.9 11.8-2.7-5.3 10.9 9.5 7.5-11.8 2.6v12.2l-9.4-7.6-9.5 7.6.1-12.2-11.8-2.6 9.5-7.5-5.3-10.9 11.8 2.7zM337.3 125.1l5.2 10.9 11.8-2.7-5.3 10.9 9.5 7.5-11.8 2.7v12.1l-9.4-7.6-9.5 7.6.1-12.1-11.9-2.7 9.5-7.5-5.3-10.9L332 136zM385.9 58.9l5.2 10.9 11.8-2.7-5.3 10.9 9.5 7.5-11.8 2.7v12.1l-9.4-7.6-9.5 7.6.1-12.1-11.8-2.7 9.5-7.5-5.3-10.9 11.8 2.7zM428.4 108.6l5.2 10.9 11.8-2.7-5.3 10.9 9.5 7.5-11.8 2.6V150l-9.4-7.6-9.5 7.6v-12.2l-11.8-2.6 9.5-7.5-5.3-10.9 11.8 2.7zM398 166.5l4.1 12.7h13.3l-10.8 7.8 4.2 12.7-10.8-7.9-10.8 7.9 4.1-12.7-10.7-7.8h13.3z"/></g><path fill="#00008b" d="M0 0h256.5v171H0z"/><g fill="#FFF"><path d="M256.5 0v30.6l-45.3 25.2h45.3v59.4h-59.2l59.2 32.9V171h-26.7l-73.7-40.9V171h-55.7v-48.7L12.8 171H0v-30.6l45.3-25.2H0V55.8h59.2L0 22.9V0h26.7l73.7 40.9V0h55.7v48.7L243.7 0z"/><path d="M156.1 115.2 256.5 171v-15.8l-72-40zM100.4 55.8 0 0v15.8l72 40z"/></g><g fill="red"><path d="M144.3 0h-32.1v69.5H0v32h112.2V171h32.1v-69.5h112.2v-32H144.3z"/><path d="M156.1 115.2 256.5 171v-15.8l-72-40zM72 115.2l-72 40V171l100.4-55.8zM100.4 55.8 0 0v15.8l72 40zM184.5 55.8l72-40V0L156.1 55.8z"/></g></svg>',
  canada: "🇨🇦",
  chile: "🇨🇱",
  england:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#D80027" d="M0 136h513v70H0z"/><path fill="#D80027" d="M221.5 0h70v342h-70z"/></svg>',
  fiji:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#62B5E5" d="M0 0h513v342H0z"/><path fill="#F3F3F3" d="M307.1 127.1v92c0 61.6 80.5 80.5 80.5 80.5s80.4-19 80.4-80.6v-92l-80.5-23-80.4 23.1z"/><path fill="#c8102e" d="M468 132.8V98.3H307.1v34.5h69v69h-69v23h69V296c6.9 2.5 11.5 3.5 11.5 3.5s4.6-1.1 11.5-3.5v-71.2h69v-23h-69v-69H468z"/><path fill="#012169" d="M0 0h256.5v171H0z"/><g fill="#FFF"><path d="M256.5 0v30.6l-45.3 25.2h45.3v59.4h-59.2l59.2 32.9V171h-26.7l-73.7-40.9V171h-55.7v-48.7L12.8 171H0v-30.6l45.3-25.2H0V55.8h59.2L0 22.9V0h26.7l73.7 40.9V0h55.7v48.7L243.7 0z"/><path d="M156.1 115.2 256.5 171v-15.8l-72-40zM100.4 55.8 0 0v15.8l72 40z"/></g><g fill="#D80027"><path d="M144.3 0h-32.1v69.5H0v32h112.2V171h32.1v-69.5h112.2v-32H144.3z"/><path d="M156.1 115.2 256.5 171v-15.8l-72-40zM72 115.2l-72 40V171l100.4-55.8zM100.4 55.8 0 0v15.8l72 40zM184.5 55.8l72-40V0L156.1 55.8z"/></g></svg>',
  scotland:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#005EB8" d="M0 0h513v342H0z"/><path fill="#FFF" d="M0 302.1V342h59.9l196.6-131.1L453.1 342H513v-39.9L316.4 171 513 39.9V0h-59.9L256.5 131.1 59.9 0H0v39.9L196.7 171z"/></svg>',
  wales:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v171H0z"/><path fill="#529E3C" d="M0 171h513v171H0z"/><path fill="#D11C1C" d="m201 259.8 28.2-4.8-21.8-10.3 14.9-8.4s25.2 21.2 25.2 14.4c0-7.3 23.7-4.1 22.7-14.4-1.3-14.1-26.2-1-30.6-18.7-2.5-9.9-10.3-8.6-10.3-8.6l-25.1 8.6-12.5 18.7-6.2-18.7s-14.6 11.9-19.5 18.7c-5.2 7.3-10.7 23.5-10.7 23.5l25.6 10.7-37.3-6.6-27.2 6.6-16.7 4.6 7.3-7.7-15-7.6 15-9-7.3-6.1 32.3 6.1s11.8-1.2 16.3-6.1c5.6-6.2 10.1-27.1 10.1-27.1l-14.8-8.6-11.6 21s-8-19.9-15.6-31c-5.7-8.3-24.3-27.3-24.3-27.3l-24 12.6 13.4-26.7s10.6-9.3 3.9-18.8c-6.8-9.5-12.4-30.9-12.4-30.9s14.1 24.4 19.2 22.5c7.2-2.7-9-25 0-28.9 6.5-2.9 7.6 25.5 7.6 25.5l7.3-13.9v17.3s-4.3 20.7 3 33c7.2 12.3 28.7 20.9 28.7 20.9s-5.6-12.3 0-36c3.8-16 17.2-43.4 23.6-52.1 3.3-4.6-26.7 17-26.7 17v-17l-28.6-2.9-7.3 8.3-18.3-30L104 83.1h34.6l-6.7-8.3H104s5.9-12.1 34.6-12.1l13.6-9.2s18.6.5 29 .9c9.3.4 26.1-11.5 26.1-11.5l4.7 11.5-11 17.3 11.1 11.4-4.7 7 8.1 11.5H201l11.1 17.9-11.1-6.3 6.4 17.3-6.4 17.8 28.2-9.5s0-25.6 10.3-37.2C271.1 69.2 322.6 43 322.6 43s-2.7 23.5 4.9 25.4c11.1 2.7 59.4-19.4 59.4-19.4s-29 31.3-23.1 34.1c3.2 1.5 8.5 7 8.5 7s-25.1 20.5-29.3 29.3c-4.2 8.8 6.1 19.4 6.1 19.4s-21.7 0-32.5 9.5c32.5 0 59.1 15.4 74.8 4 10.5-7.6-37.7-2.9-31.4-21.9 2.4-7.1 8.5-15.2 22.6-17.3s19.1 6.3 19.1 6.3l7.6-11.5h-22.4l40.6-39.6 5.3 51.1-13.7-11.4-6.2 19.2c14.6 44.6-52.8 54.1-52.8 54.1l41.6 27.8-14.8 4.2-4.2 41.7 19.1 15.5-25-6.6-49.2 11.2 9.8-15.3-20.6 4.1 13.7-13.1-13.7-6.1 17.6-4.9 22.1 15.2s11-14.2 12.2-21.7c1.3-7.8-4.8-24.2-4.8-24.2s-32.6-.7-44.1-3.5-18.2-11.9-18.2-11.9l-13.1 15.4s45.5 17.1 34.1 24.2c-2.6 1.7-15.7-3.2-15.7-3.2s-22.4 26.2-36.8 29.7c-6.5 1.6 18.3 10.7 18.3 10.7s-21.2-3.4-32-6.6c-11.3-3.4-44.4 6.6-44.4 6.6l-11-10.7zM383.9 138c3.1 0 5.7-2.6 5.7-5.7s-2.6-5.7-5.7-5.7-5.7 2.6-5.7 5.7 2.5 5.7 5.7 5.7z"/></svg>',
  france:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#00318A" d="M0 0h171v342H0z"/><path fill="#D80027" d="M342 0h171v342H342z"/></svg>',
  georgia: "🇬🇪",
  ireland:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#6DA544" d="M0 0h171v342H0z"/><path fill="#FF9811" d="M342 0h171v342H342z"/></svg>',
  italy:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#F4F5F0" d="M342 0H0v341.3h512V0z"/><path fill="#008C45" d="M0 0h171v342H0z"/><path fill="#CD212A" d="M342 0h171v342H342z"/></svg>',
  japan:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><rect width="513" height="342" fill="#FFF"/><circle cx="256.5" cy="171" r="102.6" fill="#BC002D"/></svg>',
  namibia: "🇳🇦",
  "new-zealand":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#012169" d="M0 0h513v342H0z"/><g fill="#D80027" stroke="#FFF" stroke-width="2" stroke-miterlimit="10"><path d="m448.9 107.7 4.2 13.1h13.8l-11.1 8.1L460 142l-11.1-8.1-11.1 8.1 4.2-13.1-11.1-8.1h13.7zM384.7 253.6l5.1 15.6h16.4l-13.2 9.7 5 15.6-13.3-9.7-13.2 9.7 5-15.6-13.3-9.7h16.5zM384.8 43.4l4.7 14.6h15.3l-12.4 8.9 4.7 14.6-12.3-9-12.4 9 4.7-14.6-12.3-8.9H380zM320.6 129.4l4.7 14.5h15.3l-12.3 9 4.7 14.5-12.4-8.9-12.3 8.9 4.7-14.5-12.4-9h15.3z"/></g><path fill="#012169" d="M0 0h256.5v171H0z"/><g fill="#FFF"><path d="M256.5 0v30.6l-45.3 25.2h45.3v59.4h-59.2l59.2 32.9V171h-26.7l-73.7-40.9V171h-55.7v-48.7L12.8 171H0v-30.6l45.3-25.2H0V55.8h59.2L0 22.9V0h26.7l73.7 40.9V0h55.7v48.7L243.7 0z"/><path d="M156.1 115.2 256.5 171v-15.8l-72-40zM100.4 55.8 0 0v15.8l72 40z"/></g><g fill="#D80027"><path d="M144.3 0h-32.1v69.5H0v32h112.2V171h32.1v-69.5h112.2v-32H144.3z"/><path d="M156.1 115.2 256.5 171v-15.8l-72-40zM72 115.2l-72 40V171l100.4-55.8zM100.4 55.8 0 0v15.8l72 40zM184.5 55.8l72-40V0L156.1 55.8z"/></g></svg>',
  portugal: "🇵🇹",
  romania: "🇷🇴",
  samoa: "🇼🇸",
  "south-africa":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 85.333 512 341.333"><path fill="#FFF" d="M0 85.337h512v341.326H0z"/><path d="M114.024 256.001 0 141.926v228.17z"/><path fill="#ffb915" d="M161.192 256 0 94.7v47.226l114.024 114.075L0 370.096v47.138z"/><path fill="#007847" d="M509.833 289.391c.058-.44.804-.878 2.167-1.318v-65.464H222.602L85.33 85.337H0V94.7L161.192 256 0 417.234v9.429h85.33l137.272-137.272h287.231z"/><path fill="#000c8a" d="M503.181 322.783H236.433l-103.881 103.88H512v-103.88z"/><path fill="#e1392d" d="M503.181 189.217H512V85.337H132.552l103.881 103.88z"/></svg>',
  spain: "🇪🇸",
  tonga: "🇹🇴",
  uruguay: "🇺🇾",
  usa: "🇺🇸",
};

function getSubdivisionFlag(tag: string): string {
  return String.fromCodePoint(
    0x1f3f4,
    ...[...tag].map((char) => 0xe0000 + char.charCodeAt(0)),
    0xe007f,
  );
}

const TEAM_IDENTITY: Record<string, TeamIdentity> = {
  argentina: { color: "#74ACDF", flag: "🇦🇷" },
  australia: { color: "#FFD700", flag: "🇦🇺" },
  bath: { color: "#002F6C", flag: "🏉" },
  bayonne: { color: "#5BA7D1", flag: "🏉" },
  "bordeaux-begles": { color: "#5B1A7A", flag: "🏉" },
  "bristol-bears": { color: "#0B1F3A", flag: "🏉" },
  benetton: { color: "#00843D", flag: "🏉" },
  blues: { color: "#0057B8", flag: "🏉" },
  brumbies: { color: "#001F5B", flag: "🏉" },
  bulls: { color: "#00A3E0", flag: "🏉" },
  cardiff: { color: "#72B7E8", flag: "🏉" },
  canada: { color: "#D80621", flag: "🇨🇦" },
  chile: { color: "#D52B1E", flag: "🇨🇱" },
  "canon-eagles": { color: "#C8102E", flag: "🏉" },
  castres: { color: "#1F75FE", flag: "🏉" },
  chiefs: { color: "#D50032", flag: "🏉" },
  clermont: { color: "#FFD100", flag: "🏉" },
  connacht: { color: "#00843D", flag: "🏉" },
  crusaders: { color: "#D71920", flag: "🏉" },
  dragons: { color: "#C8102E", flag: "🏉" },
  edinburgh: { color: "#003A70", flag: "🏉" },
  england: { color: "#CC0000", flag: getSubdivisionFlag("gbeng") },
  "exeter-chiefs": { color: "#111111", flag: "🏉" },
  "fijian-drua": { color: "#00A3E0", flag: "🏉" },
  fiji: { color: "#68BFE5", flag: "🇫🇯" },
  force: { color: "#003DA5", flag: "🏉" },
  france: { color: "#002395", flag: "🇫🇷" },
  georgia: { color: "#FF0000", flag: "🇬🇪" },
  grenoble: { color: "#D71920", flag: "🏉" },
  gloucester: { color: "#C8102E", flag: "🏉" },
  "glasgow-warriors": { color: "#111111", flag: "🏉" },
  harlequins: { color: "#1E7F3B", flag: "🏉" },
  highlanders: { color: "#FFD100", flag: "🏉" },
  hurricanes: { color: "#FEDD00", flag: "🏉" },
  ireland: { color: "#009A44", flag: "🇮🇪" },
  italy: { color: "#0070B8", flag: "🇮🇹" },
  japan: { color: "#BC002D", flag: "🇯🇵" },
  "la-rochelle": { color: "#F6C400", flag: "🏉" },
  "leicester-tigers": { color: "#006B3F", flag: "🏉" },
  leinster: { color: "#0032A0", flag: "🏉" },
  "kobelco-kobe-steelers": { color: "#D71920", flag: "🏉" },
  "kubota-spears": { color: "#F28C00", flag: "🏉" },
  lions: { color: "#D71920", flag: "🏉" },
  lyon: { color: "#D50032", flag: "🏉" },
  "mitsubishi-dynaboars": { color: "#0A3A8D", flag: "🏉" },
  montpellier: { color: "#0A3A8D", flag: "🏉" },
  munster: { color: "#C8102E", flag: "🏉" },
  "moana-pasifika": { color: "#2E1A47", flag: "🏉" },
  namibia: { color: "#003580", flag: "🇳🇦" },
  "newcastle-falcons": { color: "#111111", flag: "🏉" },
  "new-zealand": { color: "#000000", flag: "🇳🇿" },
  "northampton-saints": { color: "#006747", flag: "🏉" },
  "urayasu-d-rocks": { color: "#003087", flag: "🏉" },
  ospreys: { color: "#111111", flag: "🏉" },
  pau: { color: "#006B3F", flag: "🏉" },
  perpignan: { color: "#C8102E", flag: "🏉" },
  portugal: { color: "#006600", flag: "🇵🇹" },
  rebels: { color: "#002B5C", flag: "🏉" },
  reds: { color: "#7A003C", flag: "🏉" },
  "ricoh-black-rams": { color: "#111111", flag: "🏉" },
  "racing-92": { color: "#7FD1E8", flag: "🏉" },
  romania: { color: "#002B7F", flag: "🇷🇴" },
  "saitama-wild-knights": { color: "#153E8A", flag: "🏉" },
  "sale-sharks": { color: "#003DA5", flag: "🏉" },
  samoa: { color: "#CE1126", flag: "🇼🇸" },
  saracens: { color: "#000000", flag: "🏉" },
  scarlets: { color: "#C8102E", flag: "🏉" },
  scotland: { color: "#003087", flag: getSubdivisionFlag("gbsct") },
  sharks: { color: "#111111", flag: "🏉" },
  "shizuoka-blue-revs": { color: "#1E88E5", flag: "🏉" },
  "south-africa": { color: "#007A4D", flag: "🇿🇦" },
  spain: { color: "#AA151B", flag: "🇪🇸" },
  "stade-francais": { color: "#E91E8F", flag: "🏉" },
  stormers: { color: "#003A70", flag: "🏉" },
  tonga: { color: "#C10000", flag: "🇹🇴" },
  toulon: { color: "#D50032", flag: "🏉" },
  toulouse: { color: "#E30613", flag: "🏉" },
  "tokyo-suntory-sungoliath": { color: "#FDB913", flag: "🏉" },
  "toshiba-brave-lupus": { color: "#D71920", flag: "🏉" },
  "toyota-verblitz": { color: "#00843D", flag: "🏉" },
  uruguay: { color: "#75AADB", flag: "🇺🇾" },
  usa: { color: "#3C3B6E", flag: "🇺🇸" },
  ulster: { color: "#D71920", flag: "🏉" },
  vannes: { color: "#003A70", flag: "🏉" },
  wales: { color: "#C8102E", flag: getSubdivisionFlag("gbwls") },
  waratahs: { color: "#6EC6E8", flag: "🏉" },
  zebre: { color: "#111111", flag: "🏉" },
};

const TEAM_STRIPES: Record<string, string[]> = {
  argentina: ["#74ACDF", "#FFFFFF", "#FCBF49"],
  australia: ["#FFD700", "#00843D"],
  bath: ["#002F6C", "#F7C600"],
  bayonne: ["#5BA7D1"],
  benetton: ["#00843D", "#FFFFFF"],
  blues: ["#0057B8"],
  brumbies: ["#001F5B"],
  "bordeaux-begles": ["#5B1A7A"],
  "bristol-bears": ["#0B1F3A", "#A7192D"],
  bulls: ["#00A3E0"],
  cardiff: ["#72B7E8", "#000000"],
  canada: ["#D80621", "#FFFFFF"],
  chile: ["#D52B1E", "#FFFFFF"],
  "canon-eagles": ["#C8102E"],
  castres: ["#1F75FE"],
  chiefs: ["#D50032"],
  clermont: ["#FFD100"],
  connacht: ["#00843D", "#FFFFFF"],
  crusaders: ["#D71920"],
  dragons: ["#C8102E", "#000000"],
  edinburgh: ["#003A70", "#FFFFFF"],
  england: ["#CC0000", "#FFFFFF"],
  "exeter-chiefs": ["#111111", "#D50032"],
  "fijian-drua": ["#00A3E0"],
  fiji: ["#68BFE5", "#FFFFFF", "#CE1126"],
  force: ["#003DA5"],
  france: ["#002395", "#FFFFFF", "#ED2939"],
  georgia: ["#FF0000", "#FFFFFF"],
  grenoble: ["#D71920"],
  gloucester: ["#C8102E", "#FFFFFF"],
  "glasgow-warriors": ["#111111", "#FFFFFF"],
  harlequins: ["#1E7F3B", "#003087", "#FFD100", "#E91E8F"],
  highlanders: ["#FFD100"],
  hurricanes: ["#FEDD00"],
  ireland: ["#169B62", "#FFFFFF", "#F77F00"],
  italy: ["#009246", "#FFFFFF", "#CE2B37"],
  japan: ["#BC002D", "#FFFFFF"],
  "kobelco-kobe-steelers": ["#D71920"],
  "kubota-spears": ["#F28C00"],
  "la-rochelle": ["#F6C400"],
  "leicester-tigers": ["#006B3F", "#FFD100"],
  leinster: ["#0032A0", "#009A44"],
  lions: ["#D71920"],
  lyon: ["#D50032"],
  "mitsubishi-dynaboars": ["#0A3A8D"],
  montpellier: ["#0A3A8D"],
  "moana-pasifika": ["#2E1A47"],
  munster: ["#C8102E", "#FFFFFF"],
  namibia: ["#003580", "#C8102E", "#009A44"],
  "newcastle-falcons": ["#111111", "#F0B429"],
  "new-zealand": ["#000000", "#FFFFFF"],
  "northampton-saints": ["#006747", "#000000"],
  "urayasu-d-rocks": ["#003087", "#FFFFFF"],
  ospreys: ["#111111", "#FFD100"],
  pau: ["#006B3F"],
  perpignan: ["#C8102E"],
  portugal: ["#006600", "#FF0000", "#FFCC00"],
  "racing-92": ["#7FD1E8"],
  rebels: ["#002B5C"],
  reds: ["#7A003C"],
  "ricoh-black-rams": ["#111111"],
  romania: ["#002B7F", "#FCD116", "#CE1126"],
  "saitama-wild-knights": ["#153E8A"],
  "sale-sharks": ["#003DA5", "#FFFFFF"],
  samoa: ["#CE1126", "#002B7F", "#FFFFFF"],
  saracens: ["#000000", "#EF3340"],
  scarlets: ["#C8102E", "#000000"],
  scotland: ["#003F87", "#FFFFFF"],
  sharks: ["#111111"],
  "shizuoka-blue-revs": ["#1E88E5"],
  "south-africa": ["#007A4D", "#FFB612", "#000000"],
  spain: ["#AA151B", "#F1BF00"],
  "stade-francais": ["#E91E8F"],
  stormers: ["#003A70"],
  tonga: ["#C10000", "#FFFFFF"],
  toulon: ["#D50032"],
  toulouse: ["#E30613"],
  "tokyo-suntory-sungoliath": ["#FDB913"],
  "toshiba-brave-lupus": ["#D71920"],
  "toyota-verblitz": ["#00843D"],
  uruguay: ["#75AADB", "#FFFFFF", "#FCD116"],
  usa: ["#3C3B6E", "#FFFFFF", "#B22234"],
  ulster: ["#D71920", "#FFFFFF"],
  vannes: ["#003A70"],
  wales: ["#C8102E", "#FFFFFF", "#00712D"],
  waratahs: ["#6EC6E8"],
  zebre: ["#111111", "#C8102E"],
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}

export function getTeamFlagSvg(slug: string): string {
  const flag = TEAM_FLAGS[slug];

  if (!flag?.startsWith("<svg")) {
    return "";
  }

  return flag;
}

export function getTeamColor(slug: string): string {
  return TEAM_IDENTITY[slug]?.color ?? "#94a3b8";
}

export function getTeamStripeColors(slug: string): string[] {
  return TEAM_STRIPES[slug] ?? [TEAM_IDENTITY[slug]?.color ?? "#94a3b8"];
}

export function getTeamStripe(
  slug: string,
  direction: "vertical" | "horizontal" = "vertical",
): string {
  const colors = TEAM_STRIPES[slug];

  if (!colors) {
    return "#94a3b8";
  }

  const dir = direction === "vertical" ? "to bottom" : "to right";
  const n = colors.length;
  const stops = colors.flatMap((color, index) => [
    `${color} ${Math.round((index / n) * 100)}%`,
    `${color} ${Math.round(((index + 1) / n) * 100)}%`,
  ]);

  return `linear-gradient(${dir}, ${stops.join(", ")})`;
}
