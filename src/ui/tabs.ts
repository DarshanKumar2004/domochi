import { TextureKeys } from '../assets/keys';
import { SceneKeys } from '../scenes/sceneKeys';

/** Bottom tab bar entries, left to right. */
export const STATION_TABS = [
  { scene: SceneKeys.Lobby, label: 'Lobby', icon: TextureKeys.IconLobby },
  { scene: SceneKeys.Fry, label: 'Fry', icon: TextureKeys.IconFry },
  { scene: SceneKeys.Glaze, label: 'Glaze', icon: TextureKeys.IconGlaze },
  { scene: SceneKeys.Toppings, label: 'Toppings', icon: TextureKeys.IconToppings },
  { scene: SceneKeys.Box, label: 'Box', icon: TextureKeys.IconBox },
] as const;

export type StationTab = (typeof STATION_TABS)[number];
export type StationKey = StationTab['scene'];
