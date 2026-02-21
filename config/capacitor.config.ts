import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.affc1ab5463f41f7ae33f788e864f6ee',
  appName: 'CyberShield',
  webDir: 'dist',
  server: {
    url: 'https://affc1ab5-463f-41f7-ae33-f788e864f6ee.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0f1c',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0f1c',
    },
  },
};

export default config;
