
# Development Workflow

'air' runs in the background, no need to build the app

The codebase is split into internal/store (database layer) and
internal/handlers (HTTP layer), with a thin main.go entrypoint.

# 1. Create a test in the relevant package (internal/store/*_test.go for
# data-layer changes, internal/handlers/*_test.go for HTTP handler changes)

# 2. Make changes that satisfy the test

# 3. Format the code
gofmt -w yourcode.go

# 4. Run tests
go test ./...

# Database schema changes
Add a new file to internal/store/migrations/ named NNNN_description.sql (next
sequence number, e.g. 0002_add_notes.sql). It is applied automatically on
startup via (*Store).migrate() in internal/store/migrations.go - do not edit
internal/store/migrations/0001_initial_schema.sql or earlier files, since they
may already be applied to existing databases.

Make sure changes can be applied to an existing database without a loss of data.

# Fixing bugs
Every time you break something, add a test to cover that scenario.

# Mobile app (mobile/)

Expo/React Native app; see mobile/AGENTS.md for Expo-specific rules.

Tests use Jest (jest-expo) and React Native Testing Library v14, whose
render, renderHook, fireEvent and userEvent calls are all async: await them.

# 1. Add a test next to the code: src/**/foo.test.ts(x) for modules,
# hooks and components; screens under src/app go in src/__tests__/ (a test
# file inside src/app would become a route).

# 2. Use the helpers in src/test-utils.tsx: mockServer (fake API over fetch,
# keyed "GET /api/plans"), renderInApp (the app's providers), selectPlan,
# mockAlerts (press Alert buttons), setNow (fix today's date). jest.setup.ts
# mocks AsyncStorage, expo-router (router calls are jest.fn), the timer's
# native module, Reanimated and gesture handler.

# 3. Run from mobile/ before declaring a change done:
npm test            # Jest, in Europe/Warsaw and en-GB so dates are stable
npx tsc --noEmit    # typecheck
npx expo lint       # lint, includes Prettier

Run tests through npm test (npm test -- path/to/file), not bare jest: the
script pins the time zone and locale that date assertions expect.
