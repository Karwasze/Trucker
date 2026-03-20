package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Workout struct {
	ID          int        `json:"id"`
	Date        string     `json:"date"`
	WorkoutType string     `json:"workout_type"`
	WorkoutDay  int        `json:"workout_day"`
	Exercises   []Exercise `json:"exercises"`
}

type Exercise struct {
	Name string `json:"name"`
	Sets []Set  `json:"sets"`
}

type ExerciseDB struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsDefault bool   `json:"is_default"`
}

type GZCLPDayExercise struct {
	Day          int    `json:"day"`
	Slot         string `json:"slot"`
	ExerciseName string `json:"exercise_name"`
}

type Set struct {
	Weight float64 `json:"weight"`
	Reps   int     `json:"reps"`
}

var db *sql.DB

func getDatabasePath() string {
	if os.Getenv("DOCKER_ENV") == "true" {
		return "/database/workouts.db"
	}
	return "./workouts.db"
}

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", getDatabasePath())
	if err != nil {
		log.Fatal(err)
	}

	// Create tables
	createTables := `
	CREATE TABLE IF NOT EXISTS workouts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT NOT NULL,
		workout_type TEXT DEFAULT 'custom',
		workout_day INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS exercise_library (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		is_default INTEGER NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS exercises (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		workout_id INTEGER,
		name TEXT NOT NULL,
		FOREIGN KEY(workout_id) REFERENCES workouts(id)
	);

	CREATE TABLE IF NOT EXISTS sets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		exercise_id INTEGER,
		reps INTEGER NOT NULL,
		weight REAL NOT NULL,
		FOREIGN KEY(exercise_id) REFERENCES exercises(id)
	);

	CREATE TABLE IF NOT EXISTS gzclp_settings (
		id INTEGER PRIMARY KEY DEFAULT 1,
		current_day INTEGER NOT NULL DEFAULT 1,
		skipped_days INTEGER NOT NULL DEFAULT 0,
		CONSTRAINT single_row CHECK (id = 1)
	);

	CREATE TABLE IF NOT EXISTS gzclp_day_exercises (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		day INTEGER NOT NULL,
		slot TEXT NOT NULL,
		exercise_name TEXT NOT NULL,
		UNIQUE(day, slot)
	);`

	_, err = db.Exec(createTables)
	if err != nil {
		log.Fatal(err)
	}

	// Add new columns if they don't exist (migration)
	db.Exec("ALTER TABLE workouts ADD COLUMN workout_type TEXT DEFAULT 'custom'")
	db.Exec("ALTER TABLE workouts ADD COLUMN workout_day INTEGER DEFAULT 0")
	// Initialize GZCLP settings
	db.Exec("INSERT OR IGNORE INTO gzclp_settings (id, current_day, skipped_days) VALUES (1, 1, 0)")

	// Populate default exercises and GZCLP day assignments
	populateDefaultExercises()
	populateDefaultGZCLPDayExercises()
}

func populateDefaultExercises() {
	exercises := []string{
		"Squat", "Bench Press", "Deadlift", "Overhead Press",
		"Front Squat", "Sumo Deadlift", "Lat Pulldown", "Bent Over Row",
		"Leg Curl", "Leg Extension", "Leg Press", "Tricep Pushdown",
		"Bicep Curl", "Calf Raise", "Lateral Raise", "Chest Fly",
	}

	for _, name := range exercises {
		db.Exec("INSERT OR IGNORE INTO exercise_library (name, is_default) VALUES (?, 1)", name)
		db.Exec("UPDATE exercise_library SET is_default = 1 WHERE name = ?", name)
	}
}

func populateDefaultGZCLPDayExercises() {
	defaults := []GZCLPDayExercise{
		// Day A1
		{Day: 1, Slot: "T1", ExerciseName: "Squat"},
		{Day: 1, Slot: "T2", ExerciseName: "Bench Press"},
		{Day: 1, Slot: "T3", ExerciseName: "Lat Pulldown"},
		{Day: 1, Slot: "Additional1", ExerciseName: "Leg Press"},
		{Day: 1, Slot: "Additional2", ExerciseName: "Chest Fly"},
		// Day B1
		{Day: 2, Slot: "T1", ExerciseName: "Overhead Press"},
		{Day: 2, Slot: "T2", ExerciseName: "Deadlift"},
		{Day: 2, Slot: "T3", ExerciseName: "Bent Over Row"},
		{Day: 2, Slot: "Additional1", ExerciseName: "Lateral Raise"},
		{Day: 2, Slot: "Additional2", ExerciseName: "Leg Curl"},
		// Day A2
		{Day: 3, Slot: "T1", ExerciseName: "Bench Press"},
		{Day: 3, Slot: "T2", ExerciseName: "Squat"},
		{Day: 3, Slot: "T3", ExerciseName: "Lat Pulldown"},
		{Day: 3, Slot: "Additional1", ExerciseName: "Chest Fly"},
		{Day: 3, Slot: "Additional2", ExerciseName: "Leg Press"},
		// Day B2
		{Day: 4, Slot: "T1", ExerciseName: "Deadlift"},
		{Day: 4, Slot: "T2", ExerciseName: "Overhead Press"},
		{Day: 4, Slot: "T3", ExerciseName: "Bent Over Row"},
		{Day: 4, Slot: "Additional1", ExerciseName: "Leg Curl"},
		{Day: 4, Slot: "Additional2", ExerciseName: "Lateral Raise"},
	}

	for _, d := range defaults {
		db.Exec("INSERT OR IGNORE INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (?, ?, ?)",
			d.Day, d.Slot, d.ExerciseName)
	}
}

func getAllExercises() ([]ExerciseDB, error) {
	var exercises []ExerciseDB

	query := "SELECT id, name, is_default FROM exercise_library ORDER BY name"

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var exercise ExerciseDB
		err := rows.Scan(&exercise.ID, &exercise.Name, &exercise.IsDefault)
		if err != nil {
			return nil, err
		}
		exercises = append(exercises, exercise)
	}

	return exercises, nil
}

func main() {
	initDB()
	defer db.Close()

	// Static file serving
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static/"))))

	http.HandleFunc("/", home)
	http.HandleFunc("/workout/new", newWorkoutForm)            // Show form to log workout
	http.HandleFunc("/workout/create", createWorkout)          // Handle form submission
	http.HandleFunc("/workouts", listWorkouts)                 // Show all logged workouts
	http.HandleFunc("/gzclp", gzclpForm)                       // GZCLP workout form
	http.HandleFunc("/gzclp/skip", skipGZCLPDay)               // Skip GZCLP workout day
	http.HandleFunc("/workout/delete", deleteWorkout)          // Delete workout endpoint
	http.HandleFunc("/statistics", statisticsPage)             // Statistics page
	http.HandleFunc("/exercises", exercisesPage)                // Exercise management page
	http.HandleFunc("/api/exercises", handleExercisesAPI)       // Exercise CRUD API
	http.HandleFunc("/api/gzclp/config", handleGZCLPConfigAPI) // GZCLP day config API
	http.HandleFunc("/api/latest-exercise", getLatestExercise)  // API endpoint for latest exercise data
	http.HandleFunc("/api/statistics", getStatisticsData)       // API endpoint for statistics data

	log.Println("Starting server on :8081")
	err := http.ListenAndServe(":8081", nil)
	log.Fatal(err)
}

func home(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("templates/home.html")
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		log.Printf("Error parsing home template: %v", err)
		return
	}

	err = tmpl.Execute(w, nil)
	if err != nil {
		http.Error(w, "Template execution error", http.StatusInternalServerError)
		log.Printf("Error executing home template: %v", err)
	}
}

func newWorkoutForm(w http.ResponseWriter, r *http.Request) {
	exercises, err := getAllExercises()
	if err != nil {
		log.Printf("Error loading exercises: %v", err)
		exercises = []ExerciseDB{}
	}

	tmpl := template.Must(template.ParseFiles("templates/workout_form.html"))
	data := struct {
		Today     string
		Exercises []ExerciseDB
	}{
		Today:     time.Now().Format("2006-01-02"),
		Exercises: exercises,
	}
	tmpl.Execute(w, data)
}

func createWorkout(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Redirect(w, r, "/workout/new", http.StatusSeeOther)
		return
	}

	// Parse form data
	r.ParseForm()

	// Get date and workout type
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

	// Create new workout
	workout := Workout{
		Date:        date,
		WorkoutType: workoutType,
		WorkoutDay:  workoutDay,
		Exercises:   []Exercise{},
	}

	// Parse exercises and sets from form
	exerciseIndex := 0
	for {
		exerciseName := r.FormValue(fmt.Sprintf("exercise_%d", exerciseIndex))
		if exerciseName == "" {
			break // No more exercises
		}

		// Create exercise
		exercise := Exercise{
			Name: exerciseName,
			Sets: []Set{},
		}

		// Parse sets for this exercise
		setIndex := 0
		for {
			repsStr := r.FormValue(fmt.Sprintf("reps_%d_%d", exerciseIndex, setIndex))
			weightStr := r.FormValue(fmt.Sprintf("weight_%d_%d", exerciseIndex, setIndex))

			if repsStr == "" || weightStr == "" {
				break // No more sets for this exercise
			}

			// Convert strings to numbers
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

			// Create set
			set := Set{
				Reps:   reps,
				Weight: weight,
			}

			exercise.Sets = append(exercise.Sets, set)
			setIndex++
		}

		workout.Exercises = append(workout.Exercises, exercise)
		exerciseIndex++
	}

	// Save workout to database
	err := saveWorkoutToDB(workout)
	if err != nil {
		http.Error(w, "Failed to save workout", http.StatusInternalServerError)
		log.Printf("Error saving workout: %v", err)
		return
	}

	// If this is a GZCLP workout, advance the day counter
	if workout.WorkoutType == "gzclp" {
		currentDay := workout.WorkoutDay
		nextDay := (currentDay % 4) + 1
		_, err = db.Exec(`
			UPDATE gzclp_settings
			SET current_day = ?
			WHERE id = 1
		`, nextDay)
		if err != nil {
			log.Printf("Error advancing GZCLP day: %v", err)
		} else {
			log.Printf("Advanced GZCLP from day %d to day %d", currentDay, nextDay)
		}
	}

	// Redirect to success page or home
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func saveWorkoutToDB(workout Workout) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert workout
	result, err := tx.Exec("INSERT INTO workouts (date, workout_type, workout_day) VALUES (?, ?, ?)",
		workout.Date, workout.WorkoutType, workout.WorkoutDay)
	if err != nil {
		return err
	}

	workoutID, err := result.LastInsertId()
	if err != nil {
		return err
	}

	// Insert exercises and sets
	for _, exercise := range workout.Exercises {
		exerciseResult, err := tx.Exec("INSERT INTO exercises (workout_id, name) VALUES (?, ?)", workoutID, exercise.Name)
		if err != nil {
			return err
		}

		exerciseID, err := exerciseResult.LastInsertId()
		if err != nil {
			return err
		}

		// Insert sets for this exercise
		for _, set := range exercise.Sets {
			_, err := tx.Exec("INSERT INTO sets (exercise_id, reps, weight) VALUES (?, ?, ?)", exerciseID, set.Reps, set.Weight)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func getWorkoutsFromDB() ([]Workout, error) {
	rows, err := db.Query(`
		SELECT w.id, w.date, w.workout_type, w.workout_day, e.id, e.name, s.reps, s.weight
		FROM workouts w
		LEFT JOIN exercises e ON w.id = e.workout_id
		LEFT JOIN sets s ON e.id = s.exercise_id
		ORDER BY w.date DESC, e.id, s.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workoutMap := make(map[int]*Workout)
	exerciseMap := make(map[int]*Exercise)

	for rows.Next() {
		var workoutID, exerciseID, workoutDay int
		var date, exerciseName, workoutType string
		var reps int
		var weight float64

		err := rows.Scan(&workoutID, &date, &workoutType, &workoutDay, &exerciseID, &exerciseName, &reps, &weight)
		if err != nil {
			return nil, err
		}

		// Create or get workout
		if _, exists := workoutMap[workoutID]; !exists {
			workoutMap[workoutID] = &Workout{
				ID:          workoutID,
				Date:        date,
				WorkoutType: workoutType,
				WorkoutDay:  workoutDay,
				Exercises:   []Exercise{},
			}
		}

		// Create or get exercise
		if _, exists := exerciseMap[exerciseID]; !exists {
			exercise := Exercise{
				Name: exerciseName,
				Sets: []Set{},
			}
			exerciseMap[exerciseID] = &exercise
			workoutMap[workoutID].Exercises = append(workoutMap[workoutID].Exercises, exercise)
		}

		// Add set to exercise
		set := Set{
			Reps:   reps,
			Weight: weight,
		}
		// Find the exercise in the workout and add the set
		for i := range workoutMap[workoutID].Exercises {
			if workoutMap[workoutID].Exercises[i].Name == exerciseName {
				workoutMap[workoutID].Exercises[i].Sets = append(workoutMap[workoutID].Exercises[i].Sets, set)
				break
			}
		}
	}

	// Convert map to slice
	var workouts []Workout
	for _, workout := range workoutMap {
		workouts = append(workouts, *workout)
	}

	return workouts, nil
}

func listWorkouts(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles("templates/workouts_list.html"))

	workouts, err := getWorkoutsFromDB()
	if err != nil {
		http.Error(w, "Failed to load workouts", http.StatusInternalServerError)
		log.Printf("Error loading workouts: %v", err)
		return
	}

	data := struct {
		Workouts []Workout
	}{
		Workouts: workouts,
	}

	log.Printf("Number of workouts: %d", len(workouts))
	err = tmpl.Execute(w, data)
	if err != nil {
		log.Printf("Template execution error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func getLatestExercise(w http.ResponseWriter, r *http.Request) {
	exerciseName := r.URL.Query().Get("name")
	if exerciseName == "" {
		http.Error(w, "Exercise name required", http.StatusBadRequest)
		return
	}

	// Query for the latest exercise data from the most recent workout
	rows, err := db.Query(`
		SELECT s.reps, s.weight
		FROM sets s
		JOIN exercises e ON s.exercise_id = e.id
		JOIN workouts w ON e.workout_id = w.id
		WHERE e.name = ? AND w.id = (
			SELECT w2.id
			FROM workouts w2
			JOIN exercises e2 ON w2.id = e2.workout_id
			WHERE e2.name = ?
			ORDER BY w2.date DESC
			LIMIT 1
		)
		ORDER BY s.id
	`, exerciseName, exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var sets []Set
	for rows.Next() {
		var set Set
		err := rows.Scan(&set.Reps, &set.Weight)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		sets = append(sets, set)
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

func getNextGZCLPWorkoutDay() (int, error) {
	var currentDay int
	err := db.QueryRow(`
		SELECT current_day FROM gzclp_settings WHERE id = 1
	`).Scan(&currentDay)

	if err != nil {
		if err == sql.ErrNoRows {
			// If no settings exist, initialize and return day 1
			db.Exec("INSERT INTO gzclp_settings (id, current_day, skipped_days) VALUES (1, 1, 0)")
			return 1, nil
		}
		return 0, err
	}

	return currentDay, nil
}

func getGZCLPExercises(workoutDay int) (string, string, string, string, string) {
	rows, err := db.Query("SELECT slot, exercise_name FROM gzclp_day_exercises WHERE day = ?", workoutDay)
	if err != nil {
		log.Printf("Error querying GZCLP day exercises: %v", err)
		return "Squat", "Bench Press", "Lat Pulldown", "Leg Press", "Chest Fly"
	}
	defer rows.Close()

	slotMap := make(map[string]string)
	for rows.Next() {
		var slot, name string
		if err := rows.Scan(&slot, &name); err != nil {
			continue
		}
		slotMap[slot] = name
	}

	if len(slotMap) == 0 {
		return "Squat", "Bench Press", "Lat Pulldown", "Leg Press", "Chest Fly"
	}

	return slotMap["T1"], slotMap["T2"], slotMap["T3"], slotMap["Additional1"], slotMap["Additional2"]
}

func getGZCLPAllDayExercises() ([]GZCLPDayExercise, error) {
	rows, err := db.Query("SELECT day, slot, exercise_name FROM gzclp_day_exercises ORDER BY day, slot")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []GZCLPDayExercise
	for rows.Next() {
		var a GZCLPDayExercise
		if err := rows.Scan(&a.Day, &a.Slot, &a.ExerciseName); err != nil {
			continue
		}
		assignments = append(assignments, a)
	}
	return assignments, nil
}

func gzclpForm(w http.ResponseWriter, r *http.Request) {
	workoutDay, err := getNextGZCLPWorkoutDay()
	if err != nil {
		log.Printf("Error getting workout day: %v", err)
		workoutDay = 1
	}

	t1, t2, t3, additional1, additional2 := getGZCLPExercises(workoutDay)

	// Get all exercises
	exercises, _ := getAllExercises()

	tmpl := template.Must(template.ParseFiles("templates/gzclp_form.html"))
	data := struct {
		Today               string
		WorkoutDay          int
		T1Exercise          string
		T2Exercise          string
		T3Exercise          string
		Additional1Exercise string
		Additional2Exercise string
		Exercises           []ExerciseDB
	}{
		Today:               time.Now().Format("2006-01-02"),
		WorkoutDay:          workoutDay,
		T1Exercise:          t1,
		T2Exercise:          t2,
		T3Exercise:          t3,
		Additional1Exercise: additional1,
		Additional2Exercise: additional2,
		Exercises:           exercises,
	}
	tmpl.Execute(w, data)
}

func skipGZCLPDay(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get current workout day (the day we're about to skip)
	currentDay, err := getNextGZCLPWorkoutDay()
	if err != nil {
		log.Printf("Error getting current workout day: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Calculate next workout day (1-4 cycle)
	nextDay := (currentDay % 4) + 1

	// Update the current day in settings and increment skipped days counter
	_, err = db.Exec(`
		UPDATE gzclp_settings
		SET current_day = ?, skipped_days = skipped_days + 1
		WHERE id = 1
	`, nextDay)

	if err != nil {
		log.Printf("Error updating GZCLP settings: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	log.Printf("Skipped GZCLP workout day %d, advanced to day %d", currentDay, nextDay)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Day skipped successfully")
}

func deleteWorkout(w http.ResponseWriter, r *http.Request) {
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

	// Delete workout and all related data using CASCADE
	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error starting transaction: %v", err)
		return
	}
	defer tx.Rollback()

	// Delete sets first (foreign key constraint)
	_, err = tx.Exec(`
		DELETE FROM sets
		WHERE exercise_id IN (
			SELECT id FROM exercises WHERE workout_id = ?
		)
	`, workoutID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error deleting sets: %v", err)
		return
	}

	// Delete exercises
	_, err = tx.Exec("DELETE FROM exercises WHERE workout_id = ?", workoutID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error deleting exercises: %v", err)
		return
	}

	// Delete workout
	result, err := tx.Exec("DELETE FROM workouts WHERE id = ?", workoutID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error deleting workout: %v", err)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error checking rows affected: %v", err)
		return
	}

	if rowsAffected == 0 {
		http.Error(w, "Workout not found", http.StatusNotFound)
		return
	}

	err = tx.Commit()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error committing transaction: %v", err)
		return
	}

	log.Printf("Successfully deleted workout ID: %d", workoutID)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Workout deleted successfully")
}

func exercisesPage(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("templates/exercises.html")
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		log.Printf("Error parsing exercises template: %v", err)
		return
	}
	tmpl.Execute(w, nil)
}

func handleExercisesAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		exercises, err := getAllExercises()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		if exercises == nil {
			exercises = []ExerciseDB{}
		}
		json.NewEncoder(w).Encode(exercises)

	case "POST":
		var exercise ExerciseDB
		if err := json.NewDecoder(r.Body).Decode(&exercise); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if exercise.Name == "" {
			http.Error(w, "Name is required", http.StatusBadRequest)
			return
		}
		result, err := db.Exec("INSERT INTO exercise_library (name, is_default) VALUES (?, 0)", exercise.Name)
		if err != nil {
			http.Error(w, "Exercise already exists or database error", http.StatusConflict)
			return
		}
		id, _ := result.LastInsertId()
		exercise.ID = int(id)
		json.NewEncoder(w).Encode(exercise)

	case "PUT":
		var exercise ExerciseDB
		if err := json.NewDecoder(r.Body).Decode(&exercise); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if exercise.ID == 0 || exercise.Name == "" {
			http.Error(w, "ID and name are required", http.StatusBadRequest)
			return
		}
		// Get old name to update references
		var oldName string
		var isDefault bool
		db.QueryRow("SELECT name, is_default FROM exercise_library WHERE id = ?", exercise.ID).Scan(&oldName, &isDefault)
		if isDefault {
			http.Error(w, "Cannot edit default exercises", http.StatusForbidden)
			return
		}

		_, err := db.Exec("UPDATE exercise_library SET name = ? WHERE id = ?",
			exercise.Name, exercise.ID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		// Update GZCLP day assignments if name changed
		if oldName != "" && oldName != exercise.Name {
			db.Exec("UPDATE gzclp_day_exercises SET exercise_name = ? WHERE exercise_name = ?", exercise.Name, oldName)
		}
		json.NewEncoder(w).Encode(exercise)

	case "DELETE":
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "ID is required", http.StatusBadRequest)
			return
		}
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid ID", http.StatusBadRequest)
			return
		}
		// Protect default exercises
		var isDefaultEx bool
		db.QueryRow("SELECT is_default FROM exercise_library WHERE id = ?", id).Scan(&isDefaultEx)
		if isDefaultEx {
			http.Error(w, "Cannot delete default exercises", http.StatusForbidden)
			return
		}
		_, err = db.Exec("DELETE FROM exercise_library WHERE id = ?", id)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGZCLPConfigAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		assignments, err := getGZCLPAllDayExercises()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(assignments)

	case "PUT":
		var assignments []GZCLPDayExercise
		if err := json.NewDecoder(r.Body).Decode(&assignments); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		for _, a := range assignments {
			_, err := tx.Exec(
				"INSERT OR REPLACE INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (?, ?, ?)",
				a.Day, a.Slot, a.ExerciseName)
			if err != nil {
				http.Error(w, "Database error", http.StatusInternalServerError)
				return
			}
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func statisticsPage(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("templates/statistics.html")
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		log.Printf("Error parsing statistics template: %v", err)
		return
	}

	err = tmpl.Execute(w, nil)
	if err != nil {
		http.Error(w, "Template execution error", http.StatusInternalServerError)
		log.Printf("Error executing statistics template: %v", err)
	}
}

type StatisticsData struct {
	Date         string  `json:"date"`
	Estimated1RM float64 `json:"estimated_1rm"`
	TotalVolume  float64 `json:"total_volume"`
}

type StatisticsResponse struct {
	Exercises []string         `json:"exercises"`
	Data      []StatisticsData `json:"data"`
}

func calculate1RM(weight float64, reps int) float64 {
	if reps == 1 {
		return weight
	}
	// Brzycki formula: 1RM = weight * (36 / (37 - reps))
	return weight * (36 / (37 - float64(reps)))
}

func getStatisticsData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	exerciseName := r.URL.Query().Get("exercise")

	if exerciseName == "" {
		// Return list of available exercises
		rows, err := db.Query(`
			SELECT DISTINCT e.name
			FROM exercises e
			JOIN workouts w ON e.workout_id = w.id
			ORDER BY e.name
		`)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error querying exercises: %v", err)
			return
		}
		defer rows.Close()

		var exercises []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				continue
			}
			exercises = append(exercises, name)
		}

		response := StatisticsResponse{
			Exercises: exercises,
			Data:      []StatisticsData{},
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("Error encoding JSON response: %v", err)
		}
		return
	}

	// Get statistics for specific exercise
	rows, err := db.Query(`
		SELECT w.date, s.weight, s.reps
		FROM sets s
		JOIN exercises e ON s.exercise_id = e.id
		JOIN workouts w ON e.workout_id = w.id
		WHERE e.name = ?
		ORDER BY w.date, s.weight DESC, s.reps DESC
	`, exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error querying exercise statistics: %v", err)
		return
	}
	defer rows.Close()

	// Group by date and calculate both best 1RM and total volume per workout
	type WorkoutData struct {
		best1RM     float64
		totalVolume float64
	}
	dateMap := make(map[string]*WorkoutData)

	for rows.Next() {
		var date string
		var weight float64
		var reps int

		if err := rows.Scan(&date, &weight, &reps); err != nil {
			continue
		}

		estimated1RM := calculate1RM(weight, reps)
		volume := weight * float64(reps)

		if workoutData, exists := dateMap[date]; exists {
			// Update best 1RM if this is higher
			if estimated1RM > workoutData.best1RM {
				workoutData.best1RM = estimated1RM
			}
			// Add to total volume
			workoutData.totalVolume += volume
		} else {
			// First set for this date
			dateMap[date] = &WorkoutData{
				best1RM:     estimated1RM,
				totalVolume: volume,
			}
		}
	}

	// Convert map to sorted slice
	var data []StatisticsData
	for date, workoutData := range dateMap {
		data = append(data, StatisticsData{
			Date:         date,
			Estimated1RM: workoutData.best1RM,
			TotalVolume:  workoutData.totalVolume,
		})
	}

	// Sort by date
	for i := 0; i < len(data)-1; i++ {
		for j := i + 1; j < len(data); j++ {
			if data[i].Date > data[j].Date {
				data[i], data[j] = data[j], data[i]
			}
		}
	}

	response := StatisticsResponse{
		Exercises: []string{},
		Data:      data,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
