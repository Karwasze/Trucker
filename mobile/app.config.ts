import { ConfigContext, ExpoConfig } from 'expo/config';

// Static config lives in app.json; this only lets a deployment rename the app
// (e.g. "Trucker Prod" in Expo Go) via APP_NAME.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: process.env.APP_NAME || config.name || 'Trucker',
  slug: config.slug ?? 'trucker',
});
