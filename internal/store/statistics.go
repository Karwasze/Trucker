package store

// calculate1RM estimates a one-rep max using the Brzycki formula.
func calculate1RM(weight float64, reps int) float64 {
	if reps == 1 {
		return weight
	}
	return weight * (36 / (37 - float64(reps)))
}

// GetStatisticsResponse returns statistics for the given exercise. If
// exerciseName is empty, it instead returns the list of exercises that have
// recorded data.
func (s *Store) GetStatisticsResponse(exerciseName string) (StatisticsResponse, error) {
	if exerciseName == "" {
		rows, err := s.db.Query(`
			SELECT DISTINCT e.name
			FROM exercises e
			JOIN workouts w ON e.workout_id = w.id
			ORDER BY e.name
		`)
		if err != nil {
			return StatisticsResponse{}, err
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

		return StatisticsResponse{
			Exercises: exercises,
			Data:      []StatisticsData{},
		}, nil
	}

	rows, err := s.db.Query(`
		SELECT w.date, s.weight, s.reps
		FROM sets s
		JOIN exercises e ON s.exercise_id = e.id
		JOIN workouts w ON e.workout_id = w.id
		WHERE e.name = ?
		ORDER BY w.date, s.weight DESC, s.reps DESC
	`, exerciseName)
	if err != nil {
		return StatisticsResponse{}, err
	}
	defer rows.Close()

	type workoutData struct {
		best1RM     float64
		totalVolume float64
	}
	dateMap := make(map[string]*workoutData)

	for rows.Next() {
		var date string
		var weight float64
		var reps int

		if err := rows.Scan(&date, &weight, &reps); err != nil {
			continue
		}

		estimated1RM := calculate1RM(weight, reps)
		volume := weight * float64(reps)

		if wd, exists := dateMap[date]; exists {
			if estimated1RM > wd.best1RM {
				wd.best1RM = estimated1RM
			}
			wd.totalVolume += volume
		} else {
			dateMap[date] = &workoutData{
				best1RM:     estimated1RM,
				totalVolume: volume,
			}
		}
	}

	data := []StatisticsData{}
	for date, wd := range dateMap {
		data = append(data, StatisticsData{
			Date:         date,
			Estimated1RM: wd.best1RM,
			TotalVolume:  wd.totalVolume,
		})
	}

	for i := 0; i < len(data)-1; i++ {
		for j := i + 1; j < len(data); j++ {
			if data[i].Date > data[j].Date {
				data[i], data[j] = data[j], data[i]
			}
		}
	}

	return StatisticsResponse{
		Exercises: []string{},
		Data:      data,
	}, nil
}
