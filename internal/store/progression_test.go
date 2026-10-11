package store

import (
	"reflect"
	"testing"
)

func TestEvaluateExercise(t *testing.T) {
	sets := func(pairs ...float64) []Set {
		var out []Set
		for i := 0; i < len(pairs); i += 2 {
			out = append(out, Set{Reps: int(pairs[i]), Weight: pairs[i+1]})
		}
		return out
	}

	tests := []struct {
		name       string
		target     PlanExercise
		logged     []Set
		wantSets   []Set
		wantMisses int
		wantResult string
	}{
		{
			name:       "exact hit adds weight increment",
			target:     PlanExercise{Sets: sets(5, 100, 5, 100), WeightIncrement: 2.5},
			logged:     sets(5, 100, 5, 100),
			wantSets:   sets(5, 102.5, 5, 102.5),
			wantResult: ResultProgressed,
		},
		{
			name:       "exceeding targets and extra sets is a hit",
			target:     PlanExercise{Sets: sets(5, 100), WeightIncrement: 2.5},
			logged:     sets(6, 105, 5, 100),
			wantSets:   sets(5, 102.5),
			wantResult: ResultProgressed,
		},
		{
			name:       "reps increment only",
			target:     PlanExercise{Sets: sets(8, 20, 8, 20), RepsIncrement: 1},
			logged:     sets(8, 20, 8, 20),
			wantSets:   sets(9, 20, 9, 20),
			wantResult: ResultProgressed,
		},
		{
			name:       "weight and reps increments together",
			target:     PlanExercise{Sets: sets(5, 60), WeightIncrement: 1.25, RepsIncrement: 1},
			logged:     sets(5, 60),
			wantSets:   sets(6, 61.25),
			wantResult: ResultProgressed,
		},
		{
			name:       "hit resets miss counter",
			target:     PlanExercise{Sets: sets(5, 100), WeightIncrement: 2.5, ConsecutiveMisses: 2},
			logged:     sets(5, 100),
			wantSets:   sets(5, 102.5),
			wantResult: ResultProgressed,
		},
		{
			name:       "fewer sets than target is a miss",
			target:     PlanExercise{Sets: sets(5, 100, 5, 100), WeightIncrement: 2.5},
			logged:     sets(5, 100),
			wantSets:   sets(5, 100, 5, 100),
			wantMisses: 1,
			wantResult: ResultMissed,
		},
		{
			name:       "one set short on reps is a miss",
			target:     PlanExercise{Sets: sets(5, 100, 5, 100), WeightIncrement: 2.5},
			logged:     sets(5, 100, 4, 100),
			wantSets:   sets(5, 100, 5, 100),
			wantMisses: 1,
			wantResult: ResultMissed,
		},
		{
			name:       "lighter weight is a miss",
			target:     PlanExercise{Sets: sets(5, 100), WeightIncrement: 2.5},
			logged:     sets(5, 97.5),
			wantSets:   sets(5, 100),
			wantMisses: 1,
			wantResult: ResultMissed,
		},
		{
			name:       "miss counter accumulates below deload threshold",
			target:     PlanExercise{Sets: sets(5, 100), DeloadAfter: 3, DeloadPercent: 10, ConsecutiveMisses: 1},
			logged:     sets(3, 100),
			wantSets:   sets(5, 100),
			wantMisses: 2,
			wantResult: ResultMissed,
		},
		{
			name:       "deload fires at threshold and resets counter",
			target:     PlanExercise{Sets: sets(5, 100, 3, 110), DeloadAfter: 3, DeloadPercent: 10, ConsecutiveMisses: 2},
			logged:     sets(3, 100),
			wantSets:   sets(5, 90, 3, 99),
			wantResult: ResultDeloaded,
		},
		{
			name:       "deload rounds to one decimal",
			target:     PlanExercise{Sets: sets(5, 52.5), DeloadAfter: 1, DeloadPercent: 15},
			logged:     sets(4, 52.5),
			wantSets:   sets(5, 44.6),
			wantResult: ResultDeloaded,
		},
		{
			name:       "deload_after zero never deloads",
			target:     PlanExercise{Sets: sets(5, 100), DeloadPercent: 10, ConsecutiveMisses: 10},
			logged:     sets(1, 100),
			wantSets:   sets(5, 100),
			wantMisses: 11,
			wantResult: ResultMissed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			original := append([]Set(nil), tt.target.Sets...)

			got, result := evaluateExercise(tt.target, tt.logged)

			if result != tt.wantResult {
				t.Errorf("expected result %q, got %q", tt.wantResult, result)
			}
			if !reflect.DeepEqual(got.Sets, tt.wantSets) {
				t.Errorf("expected sets %+v, got %+v", tt.wantSets, got.Sets)
			}
			if got.ConsecutiveMisses != tt.wantMisses {
				t.Errorf("expected %d consecutive misses, got %d", tt.wantMisses, got.ConsecutiveMisses)
			}
			if !reflect.DeepEqual(tt.target.Sets, original) {
				t.Errorf("input targets were mutated: %+v", tt.target.Sets)
			}
		})
	}
}

func TestEvaluateExercise_RepeatedIncrementsDoNotDrift(t *testing.T) {
	ex := PlanExercise{Sets: []Set{{Reps: 5, Weight: 20}}, WeightIncrement: 0.1}
	for i := 0; i < 30; i++ {
		ex, _ = evaluateExercise(ex, ex.Sets)
	}
	if ex.Sets[0].Weight != 23 {
		t.Errorf("expected weight 23 after 30 increments of 0.1, got %v", ex.Sets[0].Weight)
	}
}
