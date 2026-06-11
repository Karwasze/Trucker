package handlers

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
)

func (h *Handlers) StatisticsPage(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles(h.tmplPath("statistics.html"))
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		log.Printf("Error parsing statistics template: %v", err)
		return
	}

	if err := tmpl.Execute(w, nil); err != nil {
		http.Error(w, "Template execution error", http.StatusInternalServerError)
		log.Printf("Error executing statistics template: %v", err)
	}
}

func (h *Handlers) StatisticsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	exerciseName := r.URL.Query().Get("exercise")

	response, err := h.store.GetStatisticsResponse(exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error querying statistics: %v", err)
		return
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
