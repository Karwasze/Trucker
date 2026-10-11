package handlers

import (
	"log"
	"net/http"
)

// Health reports whether the server can reach its database, for liveness and
// readiness probes.
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	if err := h.store.Ping(); err != nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		log.Printf("Health check failed: %v", err)
		return
	}
	w.Write([]byte("ok"))
}
