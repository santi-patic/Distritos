import type { CapacitorConfig } from '@capacitor/cli';

// Envoltorio de Android para probar el tacto (fundacional, F1). El proyecto `android/` lo genera
// la CI con `cap add android` en cada construcción; no se versiona hasta que haya que tocarlo.
const config: CapacitorConfig = {
  appId: 'io.github.santipatic.distritos',
  appName: 'Distritos',
  webDir: 'dist',
  backgroundColor: '#0f1820',
  android: { allowMixedContent: false },
};

export default config;
