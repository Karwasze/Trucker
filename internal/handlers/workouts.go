package handlers

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"strconv"
	"time"

	"trucker/internal/store"
)

func (h *Handlers) NewWorkoutForm(w http.ResponseWriter, r *http.Request) {
	exercises, err := h.store.GetAllExercises()
	if err != nil {
		log.Printf("Error loading exercises: %v", err)
		exercises = []store.ExerciseDB{}
	}

	tmpl := template.Must(template.ParseFiles(h.tmplPath("workout_form.html")))
	data := struct {
		Today     string
		Exercises []store.ExerciseDB
	}{
		Today:     time.Now().Format("2006-01-02"),
		Exercises: exercises,
	}
	tmpl.Execute(w, data)
}

func (h *Handlers) CreateWorkout(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Redirect(w, r, "/workout/new", http.StatusSeeOther)
		return
	}

	r.ParseForm()

	date := r.FormValue("date")
	workoutType := r.FormValue("workout_type")
	if workoutType == "" {
		workoutType = "custom"
	}

	workoutDayStr := r.FormValue("workout_day")
	workoutDay := 0
	if workoutDayStr != "" {
		workoutDay, _ = strconv.Atoi(workoutDayStr)
	}

	workout := store.Workout{
		Date:        date,
		WorkoutType: workoutType,
		WorkoutDay:  workoutDay,
		Exercises:   []store.Exercise{},
	}

	exerciseIndex := 0
	for {
		exerciseName := r.FormValue(fmt.Sprintf("exercise_%d", exerciseIndex))
		if exerciseName == "" {
			break // No more exercises
		}

		exercise := store.Exercise{
			Name: exerciseName,
			Sets: []store.Set{},
		}

		setIndex := 0
		for {
			repsKey := fmt.Sprintf("reps_%d_%d", exerciseIndex, setIndex)
			weightKey := fmt.Sprintf("weight_%d_%d", exerciseIndex, setIndex)

			_, repsExists := r.Form[repsKey]
			_, weightExists := r.Form[weightKey]
			if !repsExists && !weightExists {
				break // No more sets for this exercise
			}

			repsStr := r.FormValue(repsKey)
			weightStr := r.FormValue(weightKey)

			if repsStr == "" || weightStr == "" {
				setIndex++
				continue
			}

			reps, err := strconv.Atoi(repsStr)
			if err != nil {
				http.Error(w, "Invalid reps value", http.StatusBadRequest)
				return
			}

			weight, err := strconv.ParseFloat(weightStr, 64)
			if err != nil {
				http.Error(w, "Invalid weight value", http.StatusBadRequest)
				return
			}

			exercise.Sets = append(exercise.Sets, store.Set{
				Reps:   reps,
				Weight: weight,
			})
			setIndex++
		}

		if len(exercise.Sets) > 0 {
			workout.Exercises = append(workout.Exercises, exercise)
		}
		exerciseIndex++
	}

	if err := h.store.SaveWorkout(workout); err != nil {
		http.Error(w, "Failed to save workout", http.StatusInternalServerError)
		log.Printf("Error saving workout: %v", err)
		return
	}

	if workout.WorkoutType == "gzclp" {
		currentDay := workout.WorkoutDay
		nextDay := store.NextGZCLPDay(currentDay)
		if err := h.store.SetGZCLPCurrentDay(nextDay); err != nil {
			log.Printf("Error advancing GZCLP day: %v", err)
		} else {
			log.Printf("Advanced GZCLP from day %d to day %d", currentDay, nextDay)
		}
	}

	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (h *Handlers) ListWorkouts(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles(h.tmplPath("workouts_list.html")))

	workouts, err := h.store.GetWorkouts()
	if err != nil {
		http.Error(w, "Failed to load workouts", http.StatusInternalServerError)
		log.Printf("Error loading workouts: %v", err)
		return
	}

	data := struct {
		Workouts []store.Workout
	}{
		Workouts: workouts,
	}

	log.Printf("Number of workouts: %d", len(workouts))
	if err := tmpl.Execute(w, data); err != nil {
		log.Printf("Template execution error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (h *Handlers) DeleteWorkout(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseForm()
	workoutIDStr := r.FormValue("id")
	if workoutIDStr == "" {
		http.Error(w, "Workout ID required", http.StatusBadRequest)
		return
	}

	workoutID, err := strconv.Atoi(workoutIDStr)
	if err != nil {
		http.Error(w, "Invalid workout ID", http.StatusBadRequest)
		return
	}

	found, err := h.store.DeleteWorkout(workoutID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error deleting workout: %v", err)
		return
	}

	if !found {
		http.Error(w, "Workout not found", http.StatusNotFound)
		return
	}

	log.Printf("Successfully deleted workout ID: %d", workoutID)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Workout deleted successfully")
}

func (h *Handlers) LatestExercise(w http.ResponseWriter, r *http.Request) {
	exerciseName := r.URL.Query().Get("name")
	if exerciseName == "" {
		http.Error(w, "Exercise name required", http.StatusBadRequest)
		return
	}

	sets, err := h.store.GetLatestExerciseSets(exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if len(sets) == 0 {
		fmt.Fprintf(w, `{"sets": []}`)
		return
	}

	fmt.Fprintf(w, `{"sets": [`)
	for i, set := range sets {
		if i > 0 {
			fmt.Fprintf(w, `,`)
		}
		fmt.Fprintf(w, `{"reps": %d, "weight": %.1f}`, set.Reps, set.Weight)
	}
	fmt.Fprintf(w, `]}`)
}
