import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (Phase 8): the same web build, wrapped by Capacitor.
// appId is permanent once the app is on Google Play.
const config: CapacitorConfig = {
  appId: 'com.domochitreats.game',
  appName: 'domochi',
  webDir: 'dist',
  android: {
    // The game has its own loading screen; keep the web view's background cream, not white.
    backgroundColor: '#fffaf0',
  },
  plugins: {
    StatusBar: { overlaysWebView: false },
  },
};

export default config;
