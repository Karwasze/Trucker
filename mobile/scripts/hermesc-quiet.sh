#!/usr/bin/env bash
# hermesc with warnings turned off. Used as HERMES_CLI_PATH (set in
# app.config.ts) so Release builds don't print a warning for every browser
# global (fetch, URL, setTimeout...) that dependencies reference in the bundle.
exec "$(dirname "$0")/../node_modules/hermes-compiler/hermesc/osx-bin/hermesc" -w "$@"
