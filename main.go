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
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
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
		category TEXT NOT NULL
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
	);`

	_, err = db.Exec(createTables)
	if err != nil {
		log.Fatal(err)
	}

	// Add new columns if they don't exist (migration)
	db.Exec("ALTER TABLE workouts ADD COLUMN workout_type TEXT DEFAULT 'custom'")
	db.Exec("ALTER TABLE workouts ADD COLUMN workout_day INTEGER DEFAULT 0")

	// Populate default exercises
	populateDefaultExercises()
}

func populateDefaultExercises() {
	exercises := []ExerciseDB{
		// T1 - Main Compounds
		{Name: "Squat", Category: "T1"},
		{Name: "Bench Press", Category: "T1"},
		{Name: "Deadlift", Category: "T1"},
		{Name: "Overhead Press", Category: "T1"},

		// T2 - Secondary Movements
		{Name: "Front Squat", Category: "T2"},
		{Name: "Incline Bench Press", Category: "T2"},
		{Name: "Sumo Deadlift", Category: "T2"},
		{Name: "Close Grip Bench Press", Category: "T2"},
		{Name: "Romanian Deadlift", Category: "T2"},
		{Name: "Paused Bench Press", Category: "T2"},

		// T3 - Accessories
		{Name: "Lat Pulldown", Category: "T3"},
		{Name: "Dumbbell Row", Category: "T3"},
		{Name: "Leg Curl", Category: "T3"},
		{Name: "Leg Extension", Category: "T3"},
		{Name: "Tricep Pushdown", Category: "T3"},
		{Name: "Bicep Curl", Category: "T3"},
		{Name: "Calf Raise", Category: "T3"},
		{Name: "Face Pull", Category: "T3"},
		{Name: "Lateral Raise", Category: "T3"},
		{Name: "Chest Fly", Category: "T3"},
	}

	for _, exercise := range exercises {
		db.Exec("INSERT OR IGNORE INTO exercise_library (name, category) VALUES (?, ?)",
			exercise.Name, exercise.Category)
	}
}

func getExercisesByCategory(category string) ([]ExerciseDB, error) {
	var exercises []ExerciseDB

	query := "SELECT id, name, category FROM exercise_library"
	var args []interface{}

	if category != "" {
		query += " WHERE category = ?"
		args = append(args, category)
	}

	query += " ORDER BY name"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var exercise ExerciseDB
		err := rows.Scan(&exercise.ID, &exercise.Name, &exercise.Category)
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
	http.HandleFunc("/workout/delete", deleteWorkout)          // Delete workout endpoint
	http.HandleFunc("/statistics", statisticsPage)             // Statistics page
	http.HandleFunc("/api/latest-exercise", getLatestExercise) // API endpoint for latest exercise data
	http.HandleFunc("/api/statistics", getStatisticsData)      // API endpoint for statistics data

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
	exercises, err := getExercisesByCategory("")
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
	var lastWorkoutDay int
	err := db.QueryRow(`
		SELECT COALESCE(MAX(workout_day), 0)
		FROM workouts
		WHERE workout_type = 'gzclp'
	`).Scan(&lastWorkoutDay)

	if err != nil && err != sql.ErrNoRows {
		return 0, err
	}

	return (lastWorkoutDay % 4) + 1, nil
}

func getGZCLPExercises(workoutDay int) (string, string, string) {
	switch workoutDay {
	case 1: // Day A1
		return "Squat", "Overhead Press", "Lat Pulldown"
	case 2: // Day B1
		return "Bench Press", "Deadlift", "Dumbbell Row"
	case 3: // Day A2
		return "Squat", "Overhead Press", "Lat Pulldown"
	case 4: // Day B2
		return "Bench Press", "Deadlift", "Dumbbell Row"
	default:
		return "Squat", "Overhead Press", "Lat Pulldown"
	}
}

func gzclpForm(w http.ResponseWriter, r *http.Request) {
	workoutDay, err := getNextGZCLPWorkoutDay()
	if err != nil {
		log.Printf("Error getting workout day: %v", err)
		workoutDay = 1
	}

	t1, t2, t3 := getGZCLPExercises(workoutDay)

	// Get exercises by category
	t1Exercises, _ := getExercisesByCategory("T1")
	t2Exercises, _ := getExercisesByCategory("T2")
	t3Exercises, _ := getExercisesByCategory("T3")

	tmpl := template.Must(template.ParseFiles("templates/gzclp_form.html"))
	data := struct {
		Today       string
		WorkoutDay  int
		T1Exercise  string
		T2Exercise  string
		T3Exercise  string
		T1Exercises []ExerciseDB
		T2Exercises []ExerciseDB
		T3Exercises []ExerciseDB
	}{
		Today:       time.Now().Format("2006-01-02"),
		WorkoutDay:  workoutDay,
		T1Exercise:  t1,
		T2Exercise:  t2,
		T3Exercise:  t3,
		T1Exercises: t1Exercises,
		T2Exercises: t2Exercises,
		T3Exercises: t3Exercises,
	}
	tmpl.Execute(w, data)
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
