// No Phaser imports, so Playwright tests can use these keys.

export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Tutorial: 'TutorialScene',
  Hud: 'HudScene',
  Lobby: 'LobbyScene',
  Order: 'OrderScene',
  Dough: 'DoughScene',
  Fry: 'FryScene',
  Glaze: 'GlazeScene',
  Toppings: 'ToppingsScene',
  Box: 'BoxScene',
  Serve: 'ServeScene',
  Settings: 'SettingsScene',
  TicketView: 'TicketViewScene',
  DaySummary: 'DaySummaryScene',
  Invite: 'InviteScene',
  Store: 'StoreScene',
  Journal: 'JournalScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
