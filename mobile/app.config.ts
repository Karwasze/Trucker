import { ConfigContext, ExpoConfig } from 'expo/config';
import { withEntitlementsPlist, withPodfile, withXcodeProject } from 'expo/config-plugins';

// Static config lives in app.json.
export default ({ config }: ConfigContext): ExpoConfig =>
  withQuietIosBuild(
    withoutPushEntitlement({
      ...config,
      name: config.name ?? 'Trucker',
      slug: config.slug ?? 'trucker',
    })
  );

// expo-notifications adds the Push Notifications entitlement, which personal
// (free) Apple teams cannot sign. The app only schedules local notifications,
// which work without it.
function withoutPushEntitlement(config: ExpoConfig): ExpoConfig {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
}

// Silences the warnings a Release build prints for code that isn't ours:
// Swift/Objective-C warnings in pods, pod run-script phases that declare no
// outputs, clang warnings from pod headers imported into our Swift targets,
// duplicate -lc++ from the pods' linker flags, the widget extension's debug
// dylibs and binary (which can't be stripped once signed) and hermesc's
// warnings about undeclared globals in the bundle and Metro's cache reset
// warning.
function withQuietIosBuild(config: ExpoConfig): ExpoConfig {
  config = withPodfile(config, (cfg) => {
    const marker = '# Quiet third-party warnings (app.config.ts)';
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /^([ \t]*)post_install do \|installer\|\n/m,
        (line, indent: string) =>
          line +
          [
            marker,
            'installer.pods_project.targets.each do |target|',
            '  target.build_configurations.each do |build_config|',
            "    build_config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'",
            "    build_config.build_settings['SWIFT_SUPPRESS_WARNINGS'] = 'YES'",
            '  end',
            '  target.shell_script_build_phases.each do |phase|',
            '    next unless phase.output_paths.to_a.empty? && phase.output_file_list_paths.to_a.empty?',
            "    phase.always_out_of_date = '1'",
            '  end',
            'end',
            '',
          ]
            .map((l) => (l ? `${indent}  ${l}` : l))
            .join('\n')
      );
    }
    return cfg;
  });

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configs: Record<string, { name?: string; buildSettings?: Record<string, unknown> }> =
      project.pbxXCBuildConfigurationSection();
    for (const { name, buildSettings: settings } of Object.values(configs)) {
      // Target configurations only; the project-level ones have no bundle id.
      if (!settings?.PRODUCT_BUNDLE_IDENTIFIER) continue;
      const ldflags = settings.OTHER_LDFLAGS;
      const flag = '"-Wl,-no_warn_duplicate_libraries"';
      if (Array.isArray(ldflags)) {
        if (!ldflags.includes(flag)) ldflags.push(flag);
      } else {
        settings.OTHER_LDFLAGS = ['"$(inherited)"', flag];
      }
      // Clang warnings from pod headers, printed when Swift imports the modules.
      const swiftFlags = String(settings.OTHER_SWIFT_FLAGS ?? '$(inherited)').replace(/^"|"$/g, '');
      if (!swiftFlags.includes('-Xcc -w')) settings.OTHER_SWIFT_FLAGS = `"${swiftFlags} -Xcc -w"`;
      if (name === 'Release') {
        settings.ENABLE_DEBUG_DYLIB = 'NO';
        settings.COPY_PHASE_STRIP = 'NO';
      }
      if (settings.INFOPLIST_FILE === 'Trucker/Info.plist') {
        settings.HERMES_CLI_PATH = '"$(PROJECT_DIR)/../scripts/hermesc-quiet.sh"';
      }
    }
    // Release bundling always resets Metro's cache, which logs a warning; any
    // warning makes Xcode print the bundle script's whole `set -x` trace.
    const phases: Record<string, { name?: string; shellScript?: string }> =
      project.hash.project.objects.PBXShellScriptBuildPhase;
    for (const phase of Object.values(phases)) {
      if (phase.name !== '"Bundle React Native code and images"' || !phase.shellScript) continue;
      if (phase.shellScript.includes('Bundler cache is empty')) continue;
      phase.shellScript = phase.shellScript.replace(
        /(`\\"\$NODE_BINARY\\" --print [^`]*react-native-xcode\.sh'\\"`)/,
        "set -o pipefail\\n$1 2>&1 | sed '/Bundler cache is empty/d'"
      );
    }
    return cfg;
  });
}
