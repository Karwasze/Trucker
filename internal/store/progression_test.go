package store

import (
	"reflect"
	"testing"
)

// setList builds sets from reps, weight pairs.
func setList(pairs ...float64) []Set {
	var out []Set
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, Set{Reps: int(pairs[i]), Weight: pairs[i+1]})
	}
	return out
}

func TestNextTarget(t *testing.T) {
	scheme := PlanExercise{Name: "Squat", Sets: 3, Reps: 5}

	tests := []struct {
		name        string
		sessions    [][]Set
		wantSets    []Set
		wantOutcome string
		wantReason  string
	}{
		{
			name:       "no history leaves the weight to the lifter",
			wantSets:   setList(5, 0, 5, 0, 5, 0),
			wantReason: "No history yet: pick a starting weight.",
		},
		{
			name:        "hitting every set adds the default step",
			sessions:    [][]Set{setList(5, 100, 5, 100, 5, 100)},
			wantSets:    setList(5, 102.5, 5, 102.5, 5, 102.5),
			wantReason:  "Weight up 2.5 kg: you completed 3 × 5 @ 100 kg last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name: "step is the most common logged weight jump",
			sessions: [][]Set{
				setList(5, 100, 5, 100, 5, 100),
				setList(5, 105, 5, 105, 5, 105),
				setList(5, 110, 5, 110, 5, 110),
				setList(5, 112.5, 5, 112.5, 5, 112.5),
				setList(5, 117.5, 5, 117.5, 5, 117.5),
			},
			wantSets:    setList(5, 122.5, 5, 122.5, 5, 122.5),
			wantReason:  "Weight up 5 kg: you completed 3 × 5 @ 117.5 kg last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name: "drops in weight don't count as a step",
			sessions: [][]Set{
				setList(5, 60, 5, 60, 5, 60),
				setList(5, 61.25, 5, 61.25, 5, 61.25),
				setList(5, 50, 5, 50, 5, 50),
			},
			wantSets:    setList(5, 51.25, 5, 51.25, 5, 51.25),
			wantReason:  "Weight up 1.25 kg: you completed 3 × 5 @ 50 kg last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name:        "extra reps, extra sets and lighter warm-ups still hit",
			sessions:    [][]Set{setList(5, 60, 6, 100, 5, 100, 5, 100, 3, 100)},
			wantSets:    setList(5, 102.5, 5, 102.5, 5, 102.5),
			wantReason:  "Weight up 2.5 kg: you completed 3 × 5 @ 100 kg last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name:        "a miss keeps the weight and adds a rep to short sets",
			sessions:    [][]Set{setList(5, 100, 4, 100, 3, 100)},
			wantSets:    setList(5, 100, 5, 100, 4, 100),
			wantReason:  "You didn't finish 3 × 5 @ 100 kg last time: same weight, one more rep on short sets. 2 more misses deload.",
			wantOutcome: ResultMissed,
		},
		{
			name:        "missing sets aim one rep above the last set done",
			sessions:    [][]Set{setList(5, 100, 4, 100)},
			wantSets:    setList(5, 100, 5, 100, 5, 100),
			wantReason:  "You didn't finish 3 × 5 @ 100 kg last time: same weight, one more rep on short sets. 2 more misses deload.",
			wantOutcome: ResultMissed,
		},
		{
			name: "two misses in a row is not yet a deload",
			sessions: [][]Set{
				setList(5, 100, 5, 100, 4, 100),
				setList(5, 100, 5, 100, 4, 100),
			},
			wantSets:    setList(5, 100, 5, 100, 5, 100),
			wantReason:  "You didn't finish 3 × 5 @ 100 kg last time: same weight, one more rep on short sets. One more miss deloads.",
			wantOutcome: ResultMissed,
		},
		{
			name: "three misses in a row at the same weight deloads 10%",
			sessions: [][]Set{
				setList(5, 100, 5, 100, 4, 100),
				setList(5, 100, 5, 100, 4, 100),
				setList(5, 100, 4, 100, 4, 100),
			},
			wantSets:    setList(5, 90, 5, 90, 5, 90),
			wantReason:  "Deloading: you missed 3 × 5 @ 100 kg 3 sessions in a row.",
			wantOutcome: ResultDeloaded,
		},
		{
			name: "deloads round to the step",
			sessions: [][]Set{
				setList(5, 100, 5, 100, 5, 100),
				setList(3, 102.5, 3, 102.5, 3, 102.5),
				setList(3, 102.5, 3, 102.5, 3, 102.5),
				setList(3, 102.5, 3, 102.5, 3, 102.5),
			},
			wantSets:    setList(5, 92.5, 5, 92.5, 5, 92.5),
			wantReason:  "Deloading: you missed 3 × 5 @ 102.5 kg 3 sessions in a row.",
			wantOutcome: ResultDeloaded,
		},
		{
			name: "misses at a different weight don't add to the streak",
			sessions: [][]Set{
				setList(3, 100, 3, 100, 3, 100),
				setList(3, 100, 3, 100, 3, 100),
				setList(3, 102.5, 3, 102.5, 3, 102.5),
			},
			wantSets:    setList(4, 102.5, 4, 102.5, 4, 102.5),
			wantReason:  "You didn't finish 3 × 5 @ 102.5 kg last time: same weight, one more rep on short sets. 2 more misses deload.",
			wantOutcome: ResultMissed,
		},
		{
			name: "a hit breaks the miss streak",
			sessions: [][]Set{
				setList(3, 100, 3, 100, 3, 100),
				setList(3, 100, 3, 100, 3, 100),
				setList(5, 100, 5, 100, 5, 100),
				setList(3, 102.5, 3, 102.5, 3, 102.5),
			},
			wantSets:    setList(4, 102.5, 4, 102.5, 4, 102.5),
			wantReason:  "You didn't finish 3 × 5 @ 102.5 kg last time: same weight, one more rep on short sets. 2 more misses deload.",
			wantOutcome: ResultMissed,
		},
		{
			name: "a deload never rounds back up to the same weight",
			sessions: [][]Set{
				setList(3, 5, 3, 5, 3, 5),
				setList(3, 5, 3, 5, 3, 5),
				setList(3, 5, 3, 5, 3, 5),
			},
			wantSets:    setList(5, 2.5, 5, 2.5, 5, 2.5),
			wantReason:  "Deloading: you missed 3 × 5 @ 5 kg 3 sessions in a row.",
			wantOutcome: ResultDeloaded,
		},
		{
			name:        "bodyweight hits add a rep to each set instead of weight",
			sessions:    [][]Set{setList(5, 0, 5, 0, 5, 0)},
			wantSets:    setList(6, 0, 6, 0, 6, 0),
			wantReason:  "One more rep per set: you completed 3 × 5 last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name:        "bodyweight reps build on the last session past the plan",
			sessions:    [][]Set{setList(8, 0, 7, 0, 6, 0, 4, 0)},
			wantSets:    setList(9, 0, 8, 0, 7, 0),
			wantReason:  "One more rep per set: you completed 3 × 5 last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name:        "a bodyweight miss adds a rep to short sets",
			sessions:    [][]Set{setList(5, 0, 4, 0, 3, 0)},
			wantSets:    setList(5, 0, 5, 0, 4, 0),
			wantReason:  "You didn't finish 3 × 5 last time: one more rep on short sets.",
			wantOutcome: ResultMissed,
		},
		{
			name: "bodyweight misses never deload",
			sessions: [][]Set{
				setList(5, 0, 5, 0, 4, 0),
				setList(5, 0, 5, 0, 4, 0),
				setList(5, 0, 4, 0, 4, 0),
			},
			wantSets:    setList(5, 0, 5, 0, 5, 0),
			wantReason:  "You didn't finish 3 × 5 last time: one more rep on short sets.",
			wantOutcome: ResultMissed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotSets, gotOutcome, gotReason := nextTarget(scheme, tt.sessions, 0)
			if !reflect.DeepEqual(gotSets, tt.wantSets) {
				t.Errorf("expected sets %+v, got %+v", tt.wantSets, gotSets)
			}
			if gotOutcome != tt.wantOutcome {
				t.Errorf("expected outcome %q, got %q", tt.wantOutcome, gotOutcome)
			}
			if gotReason != tt.wantReason {
				t.Errorf("expected reason %q, got %q", tt.wantReason, gotReason)
			}
		})
	}
}

func TestNextTarget_AfterBreak(t *testing.T) {
	scheme := PlanExercise{Name: "Squat", Sets: 3, Reps: 5}

	tests := []struct {
		name        string
		sessions    [][]Set
		daysOff     int
		wantSets    []Set
		wantOutcome string
		wantReason  string
	}{
		{
			name:        "under two weeks off progresses as usual",
			sessions:    [][]Set{setList(5, 100, 5, 100, 5, 100)},
			daysOff:     13,
			wantSets:    setList(5, 102.5, 5, 102.5, 5, 102.5),
			wantReason:  "Weight up 2.5 kg: you completed 3 × 5 @ 100 kg last time.",
			wantOutcome: ResultProgressed,
		},
		{
			name:        "two weeks off drops the weight 10%",
			sessions:    [][]Set{setList(5, 100, 5, 100, 5, 100)},
			daysOff:     14,
			wantSets:    setList(5, 90, 5, 90, 5, 90),
			wantReason:  "Back after 2 weeks off: weight down 10% from 100 kg to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name:        "four weeks off drops the weight 20%",
			sessions:    [][]Set{setList(5, 100, 5, 100, 5, 100)},
			daysOff:     30,
			wantSets:    setList(5, 80, 5, 80, 5, 80),
			wantReason:  "Back after 4 weeks off: weight down 20% from 100 kg to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name:        "eight weeks off drops the weight 30%",
			sessions:    [][]Set{setList(5, 100, 5, 100, 5, 100)},
			daysOff:     60,
			wantSets:    setList(5, 70, 5, 70, 5, 70),
			wantReason:  "Back after 8 weeks off: weight down 30% from 100 kg to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name: "the lighter weight rounds to the learned step",
			sessions: [][]Set{
				setList(5, 97.5, 5, 97.5, 5, 97.5),
				setList(5, 102.5, 5, 102.5, 5, 102.5),
			},
			daysOff:     21,
			wantSets:    setList(5, 90, 5, 90, 5, 90),
			wantReason:  "Back after 3 weeks off: weight down 10% from 102.5 kg to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name:        "a miss before the break restarts at the planned reps",
			sessions:    [][]Set{setList(5, 100, 4, 100, 3, 100)},
			daysOff:     14,
			wantSets:    setList(5, 90, 5, 90, 5, 90),
			wantReason:  "Back after 2 weeks off: weight down 10% from 100 kg to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name:        "bodyweight exercises drop reps instead",
			sessions:    [][]Set{setList(8, 0, 7, 0, 6, 0, 4, 0)},
			daysOff:     14,
			wantSets:    setList(7, 0, 6, 0, 5, 0),
			wantReason:  "Back after 2 weeks off: 10% fewer reps to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name:        "bodyweight reps never drop below one",
			sessions:    [][]Set{setList(1, 0)},
			daysOff:     60,
			wantSets:    setList(1, 0, 1, 0, 1, 0),
			wantReason:  "Back after 8 weeks off: 30% fewer reps to ease back in.",
			wantOutcome: ResultReturning,
		},
		{
			name:       "no history has nothing to ease back into",
			daysOff:    60,
			wantSets:   setList(5, 0, 5, 0, 5, 0),
			wantReason: "No history yet: pick a starting weight.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotSets, gotOutcome, gotReason := nextTarget(scheme, tt.sessions, tt.daysOff)
			if !reflect.DeepEqual(gotSets, tt.wantSets) {
				t.Errorf("expected sets %+v, got %+v", tt.wantSets, gotSets)
			}
			if gotOutcome != tt.wantOutcome {
				t.Errorf("expected outcome %q, got %q", tt.wantOutcome, gotOutcome)
			}
			if gotReason != tt.wantReason {
				t.Errorf("expected reason %q, got %q", tt.wantReason, gotReason)
			}
		})
	}
}

func TestNextTarget_RepeatedStepsDoNotDrift(t *testing.T) {
	scheme := PlanExercise{Name: "Curl", Sets: 1, Reps: 8}
	sessions := [][]Set{setList(8, 10), setList(8, 10.1)}

	for i := 0; i < 50; i++ {
		target, _, _ := nextTarget(scheme, sessions, 0)
		sessions = append(sessions, target)
	}

	last := sessions[len(sessions)-1][0].Weight
	if last != 15.1 {
		t.Errorf("expected 15.1 after 51 steps of 0.1, got %v", last)
	}
}

func TestFreeExerciseTarget(t *testing.T) {
	tests := []struct {
		name     string
		sessions [][]Set
		want     []Set
	}{
		{
			name: "no history has no target",
		},
		{
			name:     "even sets add the default step",
			sessions: [][]Set{setList(10, 10, 10, 10, 10, 10, 10, 10)},
			want:     setList(10, 12.5, 10, 12.5, 10, 12.5, 10, 12.5),
		},
		{
			name: "step is learned from history",
			sessions: [][]Set{
				setList(8, 20, 8, 20),
				setList(8, 21, 8, 21),
			},
			want: setList(8, 22, 8, 22),
		},
		{
			name:     "short sets add a rep at the same weight",
			sessions: [][]Set{setList(10, 60, 10, 60, 8, 60, 7, 60)},
			want:     setList(10, 60, 10, 60, 9, 60, 8, 60),
		},
		{
			name:     "warm-up sets are dropped",
			sessions: [][]Set{setList(10, 20, 5, 60, 5, 60, 5, 60)},
			want:     setList(5, 62.5, 5, 62.5, 5, 62.5),
		},
		{
			name:     "bodyweight sets add a rep to short sets",
			sessions: [][]Set{setList(12, 0, 10, 0)},
			want:     setList(12, 0, 11, 0),
		},
		{
			name:     "even bodyweight sets add a rep to each",
			sessions: [][]Set{setList(12, 0, 12, 0)},
			want:     setList(13, 0, 13, 0),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _ := freeExerciseTarget(tt.sessions, 0)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFreeExerciseTarget_FromStore(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-10-10", []Exercise{
		{Name: "Bench Press", Sets: setList(10, 10, 10, 10, 10, 10, 10, 10)},
	})

	got, reason, err := s.FreeExerciseTarget("Bench Press", "2026-10-14")
	if err != nil {
		t.Fatal(err)
	}
	if want := setList(10, 12.5, 10, 12.5, 10, 12.5, 10, 12.5); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if want := "Weight up 2.5 kg: you completed 4 × 10 @ 10 kg last time."; reason != want {
		t.Errorf("expected reason %q, got %q", want, reason)
	}

	// Workouts after the date don't count.
	got, _, err = s.FreeExerciseTarget("Bench Press", "2026-10-09")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("expected no target before any history, got %v", got)
	}
}

func TestFreeExerciseTarget_AfterBreak(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-09-01", []Exercise{
		{Name: "Bench Press", Sets: setList(10, 60, 10, 60)},
	})

	got, reason, err := s.FreeExerciseTarget("Bench Press", "2026-10-14")
	if err != nil {
		t.Fatal(err)
	}
	if want := setList(10, 47.5, 10, 47.5); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if want := "Back after 6 weeks off: weight down 20% from 60 kg to ease back in."; reason != want {
		t.Errorf("expected reason %q, got %q", want, reason)
	}
}
