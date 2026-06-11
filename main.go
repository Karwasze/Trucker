package main

import (
	"log"
	"net/http"
	"os"

	"trucker/internal/handlers"
	"trucker/internal/store"
)

func getDatabasePath() string {
	if os.Getenv("DOCKER_ENV") == "true" {
		return "/database/workouts.db"
	}
	return "./workouts.db"
}

func main() {
	st, err := store.Open(getDatabasePath())
	if err != nil {
		log.Fatal(err)
	}
	defer st.Close()

	if err := st.SeedDefaults(); err != nil {
		log.Fatal(err)
	}

	h := handlers.New(st, "templates")

	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static/"))))
	h.RegisterRoutes(mux)

	log.Println("Starting server on :8081")
	log.Fatal(http.ListenAndServe(":8081", mux))
}
