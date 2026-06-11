package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"trucker/internal/store"
)

func TestStatisticsPageHandler(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/statistics", nil)
	w := httptest.NewRecorder()
	h.StatisticsPage(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestStatisticsAPI_ExerciseList(t *testing.T) {
	h, s := newTestHandlers(t)

	seedWorkout(t, s, "2026-03-15", "custom", 0, []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}}},
		{Name: "Bench Press", Sets: []store.Set{{Weight: 80, Reps: 8}}},
	})

	req := httptest.NewRequest("GET", "/api/statistics", nil)
	w := httptest.NewRecorder()
	h.StatisticsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var response store.StatisticsResponse
	json.NewDecoder(w.Body).Decode(&response)
	if len(response.Exercises) != 2 {
		t.Errorf("expected 2 exercises, got %d", len(response.Exercises))
	}
}

func TestStatisticsAPI_ExerciseData(t *testing.T) {
	h, s := newTestHandlers(t)

	seedWorkout(t, s, "2026-03-10", "custom", 0, []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}, {Weight: 80, Reps: 10}}},
	})
	seedWorkout(t, s, "2026-03-15", "custom", 0, []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 110, Reps: 5}}},
	})

	req := httptest.NewRequest("GET", "/api/statistics?exercise=Squat", nil)
	w := httptest.NewRecorder()
	h.StatisticsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var response store.StatisticsResponse
	json.NewDecoder(w.Body).Decode(&response)
	if len(response.Data) != 2 {
		t.Fatalf("expected 2 data points, got %d", len(response.Data))
	}

	// Should be sorted by date
	if response.Data[0].Date != "2026-03-10" {
		t.Errorf("expected first date 2026-03-10, got %s", response.Data[0].Date)
	}
	if response.Data[1].Date != "2026-03-15" {
		t.Errorf("expected second date 2026-03-15, got %s", response.Data[1].Date)
	}

	// Verify 1RM calculation for first workout: max of (100*5) and (80*10)
	// 100 * 36/32 = 112.5, 80 * 36/27 = 106.67 → best is 112.5
	if response.Data[0].Estimated1RM < 112.4 || response.Data[0].Estimated1RM > 112.6 {
		t.Errorf("expected estimated 1RM ~112.5, got %.2f", response.Data[0].Estimated1RM)
	}

	// Verify total volume for first workout: (100*5) + (80*10) = 500 + 800 = 1300
	if response.Data[0].TotalVolume != 1300 {
		t.Errorf("expected total volume 1300, got %.0f", response.Data[0].TotalVolume)
	}
}

func TestStatisticsAPI_NoExerciseData(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/statistics?exercise=Nonexistent", nil)
	w := httptest.NewRecorder()
	h.StatisticsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var response store.StatisticsResponse
	json.NewDecoder(w.Body).Decode(&response)
	if response.Data == nil || len(response.Data) != 0 {
		t.Errorf("expected empty data array, got %v", response.Data)
	}
}
