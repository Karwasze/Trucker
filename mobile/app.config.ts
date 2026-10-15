import { ConfigContext, ExpoConfig } from 'expo/config';
import { withEntitlementsPlist } from 'expo/config-plugins';

// Static config lives in app.json.
export default ({ config }: ConfigContext): ExpoConfig =>
  withoutPushEntitlement({
    ...config,
    name: config.name ?? 'Trucker',
    slug: config.slug ?? 'trucker',
  });

// expo-notifications adds the Push Notifications entitlement, which personal
// (free) Apple teams cannot sign. The app only schedules local notifications,
// which work without it.
function withoutPushEntitlement(config: ExpoConfig): ExpoConfig {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
}
