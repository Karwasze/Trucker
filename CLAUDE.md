
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