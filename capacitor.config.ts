import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xenorift.game',
  appName: 'Xeno Rift',
  webDir: 'dist',
  backgroundColor: '#05010f',
  android: {
    // Pas de contenu mixte ni de débogage WebView en release.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
