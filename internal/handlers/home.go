package handlers

import (
	"html/template"
	"log"
	"net/http"
)

func (h *Handlers) Home(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles(h.tmplPath("home.html"))
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		log.Printf("Error parsing home template: %v", err)
		return
	}

	if err := tmpl.Execute(w, nil); err != nil {
		http.Error(w, "Template execution error", http.StatusInternalServerError)
		log.Printf("Error executing home template: %v", err)
	}
}
