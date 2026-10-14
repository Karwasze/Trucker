#!/bin/sh
# Starts Metro for Expo Go.
#
# Expo Go keeps each app's storage (the active plan, the workout draft) under
# the manifest's scope key, which Expo CLI derives from a random ID it saves
# in ~/.expo/state.json. A fresh container would pick a new one and the phone
# would start over with empty storage, so EXPO_SCOPE_ID pins it.
set -e

if [ -n "$EXPO_SCOPE_ID" ]; then
  mkdir -p "$HOME/.expo"
  printf '{"uuid":"%s"}\n' "$EXPO_SCOPE_ID" > "$HOME/.expo/state.json"
fi

exec npx expo start --port "$METRO_PORT"
