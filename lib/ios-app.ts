export const IOS_APP_ID = "6791587357";

const APP_STORE_BASE_URL = `https://apps.apple.com/jp/app/id${IOS_APP_ID}`;

export type IosAppCtaSurface = "calendar" | "hub";

export function getIosAppStoreUrl(surface: IosAppCtaSurface): string {
  return `${APP_STORE_BASE_URL}?ct=${surface}`;
}
