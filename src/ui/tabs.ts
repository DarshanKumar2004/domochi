import { TextureKeys } from '../assets/keys';
import { SceneKeys } from '../scenes/sceneKeys';

/** Bottom tab bar entries, left to right. */
export const STATION_TABS = [
  { scene: SceneKeys.Lobby, label: 'Lobby', icon: TextureKeys.IconLobby },
  { scene: SceneKeys.Dough, label: 'Dough', icon: TextureKeys.IconDough },
  { scene: SceneKeys.Fry, label: 'Fry', icon: TextureKeys.IconFry },
  { scene: SceneKeys.Glaze, label: 'Glaze', icon: TextureKeys.IconGlaze },
  { scene: SceneKeys.Toppings, label: 'Toppings', icon: TextureKeys.IconToppings },
  // Only once kolaches / onigiri are on the menu (see visibleTabs).
  { scene: SceneKeys.Bake, label: 'Bake', icon: TextureKeys.IconBake, side: 'kolache' },
  { scene: SceneKeys.Rice, label: 'Rice', icon: TextureKeys.IconRice, side: 'onigiri' },
  { scene: SceneKeys.Box, label: 'Box', icon: TextureKeys.IconBox },
] as const;

/** The tabs to show today: the Bake and Rice stations only once their food is on the menu. */
export function visibleTabs(onMenu: (kind: 'kolache' | 'onigiri') => boolean): StationTab[] {
  return STATION_TABS.filter((t) => !('side' in t) || onMenu(t.side));
}

export type StationTab = (typeof STATION_TABS)[number];
export type StationKey = StationTab['scene'];
