// No Phaser imports, so Playwright tests can use these keys.

export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Tutorial: 'TutorialScene',
  Hud: 'HudScene',
  Lobby: 'LobbyScene',
  Order: 'OrderScene',
  Fry: 'FryScene',
  Glaze: 'GlazeScene',
  Toppings: 'ToppingsScene',
  Box: 'BoxScene',
  Serve: 'ServeScene',
  Settings: 'SettingsScene',
  TicketView: 'TicketViewScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
