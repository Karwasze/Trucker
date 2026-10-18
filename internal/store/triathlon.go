package store

import (
	"math"
	"slices"
)

// Classes of a Triathlon, by its distances.
const (
	TriathlonSprint  = "sprint"
	TriathlonQuarter = "quarter"
	TriathlonHalf    = "half"
	TriathlonFull    = "full"
	TriathlonCustom  = "custom"
)

// triathlonStandard is a class's distances (m) and the typical share of the
// total time each leg takes amateurs, transitions left out.
type triathlonStandard struct {
	class           string
	swim, bike, run float64
	share           map[string]float64
}

// triathlonStandards are the standard classes, shortest first.
var triathlonStandards = []triathlonStandard{
	{TriathlonSprint, 750, 20000, 5000, map[string]float64{"swim": 0.18, "bike": 0.50, "run": 0.32}},
	// A quarter Ironman.
	{TriathlonQuarter, 950, 45000, 10550, map[string]float64{"swim": 0.12, "bike": 0.52, "run": 0.36}},
	{TriathlonHalf, 1900, 90000, 21097, map[string]float64{"swim": 0.11, "bike": 0.52, "run": 0.37}},
	{TriathlonFull, 3800, 180000, 42195, map[string]float64{"swim": 0.10, "bike": 0.52, "run": 0.38}},
}

// triathlonTolerance is how far off (as a fraction) each leg may be from a
// class's distance and still count as that class.
const triathlonTolerance = 0.25

// weakestMargin is how far (as a share of the total time) a leg must take
// longer than typical to be called the weakest.
const weakestMargin = 0.03

// TriathlonLeg is a discipline of a Triathlon: the day's workouts of that
// activity added up.
type TriathlonLeg struct {
	WorkoutIDs      []int   `json:"workout_ids"`
	DistanceM       float64 `json:"distance_m"`
	DurationSeconds float64 `json:"duration_seconds"`
}

// Triathlon is a day with at least one swim, ride and run, in any order and
// however far apart. TotalSeconds adds up the legs, without transitions.
// PR is set when it was the fastest of its Class so far, including the
// first; TriathlonCustom distances aren't comparable, so are never PRs.
type Triathlon struct {
	Date         string       `json:"date"`
	Class        string       `json:"class"`
	Swim         TriathlonLeg `json:"swim"`
	Bike         TriathlonLeg `json:"bike"`
	Run          TriathlonLeg `json:"run"`
	TotalSeconds float64      `json:"total_seconds"`
	PR           bool         `json:"pr"`
}

// TriathlonSummary is the triathlons of the timespan: how many, the Latest
// and (when there were several) the First, to compare leg speeds; the
// fastest of each standard class of all time (Records, shortest class
// first); and the share of Latest's time each leg ("swim", "bike", "run")
// took against the TypicalShare for its class (absent for custom
// distances). Weakest is the leg taking the most more than typical, when
// one does by weakestMargin.
type TriathlonSummary struct {
	Count        int                `json:"count"`
	Latest       Triathlon          `json:"latest"`
	First        *Triathlon         `json:"first,omitempty"`
	Records      []Triathlon        `json:"records"`
	Share        map[string]float64 `json:"share"`
	TypicalShare map[string]float64 `json:"typical_share,omitempty"`
	Weakest      string             `json:"weakest,omitempty"`
}

// ListTriathlons returns every triathlon, newest first.
func (s *Store) ListTriathlons() ([]Triathlon, error) {
	cardio, err := s.ListCardioWorkouts("")
	if err != nil {
		return nil, err
	}
	slices.Reverse(cardio)
	tris := triathlons(cardio)
	slices.Reverse(tris)
	return tris, nil
}

// triathlons finds the triathlons among cardio workouts (oldest first),
// oldest first.
func triathlons(cardio []CardioWorkout) []Triathlon {
	tris := []Triathlon{}
	best := make(map[string]float64)
	for i := 0; i < len(cardio); {
		j := i
		for j < len(cardio) && cardio[j].Date == cardio[i].Date {
			j++
		}
		tri := Triathlon{Date: cardio[i].Date}
		for _, w := range cardio[i:j] {
			var leg *TriathlonLeg
			switch w.Activity {
			case ActivitySwimming:
				leg = &tri.Swim
			case ActivityCycling:
				leg = &tri.Bike
			case ActivityRunning:
				leg = &tri.Run
			default:
				continue
			}
			leg.WorkoutIDs = append(leg.WorkoutIDs, w.ID)
			leg.DurationSeconds += w.DurationSeconds
			if w.DistanceM != nil {
				leg.DistanceM += *w.DistanceM
			}
		}
		i = j
		if tri.Swim.WorkoutIDs == nil || tri.Bike.WorkoutIDs == nil || tri.Run.WorkoutIDs == nil {
			continue
		}
		tri.Class = triathlonClass(tri.Swim.DistanceM, tri.Bike.DistanceM, tri.Run.DistanceM)
		tri.TotalSeconds = tri.Swim.DurationSeconds + tri.Bike.DurationSeconds + tri.Run.DurationSeconds
		if tri.Class != TriathlonCustom {
			if fastest, ok := best[tri.Class]; !ok || tri.TotalSeconds < fastest {
				best[tri.Class] = tri.TotalSeconds
				tri.PR = true
			}
		}
		tris = append(tris, tri)
	}
	return tris
}

// triathlonClass is the standard class whose distances are closest to the
// legs', or TriathlonCustom when every class has a leg too far off.
func triathlonClass(swim, bike, run float64) string {
	class, closest := TriathlonCustom, math.Inf(1)
	for _, std := range triathlonStandards {
		off := max(
			math.Abs(swim-std.swim)/std.swim,
			math.Abs(bike-std.bike)/std.bike,
			math.Abs(run-std.run)/std.run,
		)
		if off <= triathlonTolerance && off < closest {
			class, closest = std.class, off
		}
	}
	return class
}

// triathlonSummary sums up the triathlons (oldest first) from from
// (YYYY-MM-DD, or "" for all time), or nil when there were none.
func triathlonSummary(tris []Triathlon, from string) *TriathlonSummary {
	var window []Triathlon
	records := make(map[string]Triathlon)
	for _, tri := range tris {
		if tri.Date >= from {
			window = append(window, tri)
		}
		if record, ok := records[tri.Class]; tri.Class != TriathlonCustom && (!ok || tri.TotalSeconds < record.TotalSeconds) {
			records[tri.Class] = tri
		}
	}
	if len(window) == 0 {
		return nil
	}

	latest := window[len(window)-1]
	summary := &TriathlonSummary{
		Count:   len(window),
		Latest:  latest,
		Records: []Triathlon{},
		Share: map[string]float64{
			"swim": round(latest.Swim.DurationSeconds/latest.TotalSeconds, 3),
			"bike": round(latest.Bike.DurationSeconds/latest.TotalSeconds, 3),
			"run":  round(latest.Run.DurationSeconds/latest.TotalSeconds, 3),
		},
	}
	if len(window) > 1 {
		summary.First = &window[0]
	}
	for _, std := range triathlonStandards {
		if record, ok := records[std.class]; ok {
			summary.Records = append(summary.Records, record)
		}
		if std.class != latest.Class {
			continue
		}
		summary.TypicalShare = std.share
		margin := weakestMargin
		for _, leg := range []string{"swim", "bike", "run"} {
			if over := summary.Share[leg] - std.share[leg]; over >= margin {
				summary.Weakest, margin = leg, over
			}
		}
	}
	return summary
}
