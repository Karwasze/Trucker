package store

import (
	"slices"
	"testing"
	"time"
)

func day(date string) time.Time {
	t, err := time.Parse(dateLayout, date)
	if err != nil {
		panic(err)
	}
	return t
}

// tenK is a 10k twelve weeks after Monday Oct 19, on Sunday Jan 10,
// training four days a week with the long run on Sundays.
func tenK() Goal {
	return Goal{
		Name: "10k", StartDate: "2026-10-19", RaceDate: "2027-01-10", RunM: fp(10000),
		Weekdays: []string{"monday", "wednesday", "friday", "sunday"}, LongDay: "sunday", Active: true,
	}
}

func quarterTri() Goal {
	return Goal{
		Name: "¼ tri", StartDate: "2026-10-19", RaceDate: "2027-01-10",
		SwimM: fp(950), BikeM: fp(45000), RunM: fp(10550),
		Weekdays: []string{"monday", "tuesday", "wednesday", "thursday", "saturday", "sunday"}, LongDay: "saturday",
	}
}

func generate(t *testing.T, in generatorInput) []PlannedSession {
	t.Helper()
	sessions, _ := generatePlan(in)
	if len(sessions) == 0 {
		t.Fatal("expected sessions")
	}
	return sessions
}

// weeklyVolume sums the planned distance per week (by Monday) of activity,
// race sessions left out.
func weeklyVolume(sessions []PlannedSession, activity string) ([]string, map[string]float64) {
	volume := make(map[string]float64)
	var weeks []string
	for _, s := range sessions {
		if s.Activity != activity || s.Kind == KindRace || s.Kind == KindBrick {
			continue
		}
		week := mondayOf(day(s.Date)).Format(dateLayout)
		if _, ok := volume[week]; !ok {
			weeks = append(weeks, week)
		}
		volume[week] += *s.TargetDistanceM
	}
	return weeks, volume
}

func TestPlanWeeks_Phases(t *testing.T) {
	weeks := planWeeks(day("2026-10-19"), day("2027-01-10"), 1)
	var phases []string
	for _, w := range weeks {
		phases = append(phases, w.phase)
	}
	// 12 weeks: 10 of training (peak 20% = 2, build 35% = 3.5 → 4, base
	// the other 4), a taper week and race week.
	want := []string{
		PhaseBase, PhaseBase, PhaseBase, PhaseBase,
		PhaseBuild, PhaseBuild, PhaseBuild, PhaseBuild,
		PhasePeak, PhasePeak, PhaseTaper, PhaseRace,
	}
	if !slices.Equal(phases, want) {
		t.Errorf("got phases %v, want %v", phases, want)
	}
	for _, w := range weeks {
		if want := (w.index+1)%4 == 0 && w.index < 10; w.recovery != want {
			t.Errorf("week %d: expected recovery %v", w.index, want)
		}
	}
}

func TestGeneratePlan_TenK(t *testing.T) {
	g := tenK()
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate)})

	phaseOrder := []string{PhaseBase, PhaseBuild, PhasePeak, PhaseTaper, PhaseRace}
	last := 0
	for _, s := range sessions {
		if s.Activity != ActivityRunning {
			t.Errorf("expected only runs, got %+v", s)
		}
		i := slices.Index(phaseOrder, s.Phase)
		if i < last {
			t.Errorf("phase %s on %s comes after %s", s.Phase, s.Date, phaseOrder[last])
		}
		last = i
		weekday := weekdayNames[isoWeekday(day(s.Date).Weekday())-1]
		if s.Kind != KindRace && !slices.Contains(g.Weekdays, weekday) {
			t.Errorf("session on %s, a %s, which isn't a training day", s.Date, weekday)
		}
		if s.Kind == KindLong && weekday != "sunday" {
			t.Errorf("long run on a %s (%s)", weekday, s.Date)
		}
	}

	race := sessions[len(sessions)-1]
	if race.Kind != KindRace || race.Date != g.RaceDate || *race.TargetDistanceM != 10000 {
		t.Errorf("expected the race last, got %+v", race)
	}

	weeks, volume := weeklyVolume(sessions, ActivityRunning)
	for i := 1; i < len(weeks); i++ {
		prev, cur := volume[weeks[i-1]], volume[weeks[i]]
		recoveryBefore := (i)%4 == 0
		// Rounding sessions to 500 m can add a little.
		if cur > prev*1.1+1000 && !recoveryBefore {
			t.Errorf("week %s grows from %v to %v, more than 10%%", weeks[i], prev, cur)
		}
	}
	if volume[weeks[3]] >= volume[weeks[2]] || volume[weeks[7]] >= volume[weeks[6]] {
		t.Errorf("expected weeks 4 and 8 to be recovery weeks, got %v", volume)
	}

	longest := 0.0
	for _, s := range sessions {
		if s.Kind == KindLong {
			longest = max(longest, *s.TargetDistanceM)
		}
	}
	if longest < 10000 || longest > 12000 {
		t.Errorf("expected the long run to peak around the race distance, got %v", longest)
	}

	// Without history, intensity is by feel.
	for _, s := range sessions {
		if s.SpeedMin != nil || s.HRMin != nil {
			t.Errorf("expected no targets without history, got %+v", s)
			break
		}
	}
}

func TestGeneratePlan_QualitySessionsByPhase(t *testing.T) {
	g := tenK()
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate)})

	kinds := make(map[string][]string)
	for _, s := range sessions {
		kinds[s.Phase] = append(kinds[s.Phase], s.Kind)
	}
	if slices.Contains(kinds[PhaseBase], KindTempo) || slices.Contains(kinds[PhaseBase], KindIntervals) {
		t.Errorf("expected no quality sessions in base, got %v", kinds[PhaseBase])
	}
	if !slices.Contains(kinds[PhaseBuild], KindTempo) {
		t.Errorf("expected tempo runs in build, got %v", kinds[PhaseBuild])
	}
	if !slices.Contains(kinds[PhasePeak], KindIntervals) {
		t.Errorf("expected intervals in peak, got %v", kinds[PhasePeak])
	}
	for _, s := range sessions {
		if s.Kind == KindIntervals && (s.Reps == nil || s.RepDistanceM == nil || *s.RepDistanceM != 800) {
			t.Errorf("expected 800 m reps for a 10k, got %+v", s)
		}
	}
}

func TestGeneratePlan_Targets(t *testing.T) {
	g := tenK()
	// A 25:00 5k: threshold ≈ 3.197 m/s, or 5:13/km.
	f := Fitness{Threshold: map[string]float64{ActivityRunning: 10000 / 3127.6}, MaxHR: 190}
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate), Fitness: f})

	easy := sessions[0]
	if easy.Kind != KindEasy {
		t.Fatalf("expected an easy run first, got %+v", easy)
	}
	// Easy is 60–90 s/km slower than threshold pace: 6:13–6:43/km.
	if got := formatSpeedRange(ActivityRunning, *easy.SpeedMin, *easy.SpeedMax); got != "6:13–6:43/km" {
		t.Errorf("expected an easy pace of 6:13–6:43/km, got %s", got)
	}
	if *easy.HRMin != 114 || *easy.HRMax != 143 {
		t.Errorf("expected 114–143 bpm, got %v–%v", *easy.HRMin, *easy.HRMax)
	}
	for _, s := range sessions {
		if s.Kind == KindIntervals {
			if want := "Intervals 4×800 m @ 4:53–5:03/km, 2 min jog · 6.5 km in all"; s.Description != want {
				t.Errorf("expected %q, got %q", want, s.Description)
			}
			if got := formatSpeedRange(ActivityRunning, *s.SpeedMin, *s.SpeedMax); got != "4:53–5:03/km" {
				t.Errorf("expected intervals at 4:53–5:03/km, got %s", got)
			}
			break
		}
	}
}

func TestGeneratePlan_QuarterTriathlon(t *testing.T) {
	g := quarterTri()
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate)})

	activities := make(map[string]bool)
	byDate := make(map[string][]PlannedSession)
	for _, s := range sessions {
		activities[s.Activity] = true
		byDate[s.Date] = append(byDate[s.Date], s)
		if s.Kind == KindBrick && s.Phase != PhaseBuild && s.Phase != PhasePeak {
			t.Errorf("brick outside build and peak: %+v", s)
		}
		weekday := weekdayNames[isoWeekday(day(s.Date).Weekday())-1]
		if s.Activity == ActivityCycling && s.Kind == KindLong && weekday != "saturday" {
			t.Errorf("long ride on a %s", weekday)
		}
	}
	for _, activity := range legOrder {
		if !activities[activity] {
			t.Errorf("expected %s sessions", activity)
		}
	}

	bricks := 0
	for date, daySessions := range byDate {
		if date == g.RaceDate {
			if len(daySessions) != 3 {
				t.Errorf("expected three race legs on race day, got %+v", daySessions)
			}
			continue
		}
		for _, s := range daySessions {
			if s.Kind == KindBrick {
				bricks++
				if len(daySessions) != 2 || daySessions[0].Activity != ActivityCycling {
					t.Errorf("expected a brick run after the long ride, got %+v", daySessions)
				}
			}
		}
		if len(daySessions) > 1 && !slices.ContainsFunc(daySessions, func(s PlannedSession) bool { return s.Kind == KindBrick }) {
			t.Errorf("expected one session a day outside bricks, got %+v", daySessions)
		}
	}
	if bricks == 0 {
		t.Error("expected bricks in build and peak")
	}

	// Six days: two sessions of each discipline in a normal week.
	counts := make(map[string]int)
	for _, s := range sessions {
		if mondayOf(day(s.Date)).Format(dateLayout) == "2026-10-19" {
			counts[s.Activity]++
		}
	}
	if counts[ActivitySwimming] != 2 || counts[ActivityCycling] != 2 || counts[ActivityRunning] != 2 {
		t.Errorf("expected 2/2/2 sessions in the first week, got %v", counts)
	}
}

func TestGeneratePlan_Warnings(t *testing.T) {
	g := tenK()
	g.StartDate = "2026-12-14"
	_, warnings := generatePlan(generatorInput{Goal: g, From: day(g.StartDate)})
	if len(warnings) != 1 {
		t.Errorf("expected a warning about 4 weeks to race day, got %v", warnings)
	}

	tri := quarterTri()
	tri.Weekdays = []string{"saturday", "sunday"}
	_, warnings = generatePlan(generatorInput{Goal: tri, From: day(tri.StartDate)})
	if len(warnings) != 1 {
		t.Errorf("expected a warning about too few days, got %v", warnings)
	}
}

func TestGeneratePlan_ContinuesFromPreviousLevel(t *testing.T) {
	g := tenK()
	// Continuing in week 3 (Nov 2) from 20 km in week 2.
	from := day("2026-11-02")
	grown := generate(t, generatorInput{Goal: g, From: from, PrevLevel: map[string]float64{ActivityRunning: 20000}})
	held := generate(t, generatorInput{Goal: g, From: from, PrevLevel: map[string]float64{ActivityRunning: 20000}, Hold: true})

	for _, s := range grown {
		if s.Date < "2026-11-02" {
			t.Fatalf("expected nothing before From, got %+v", s)
		}
	}
	_, grownVolume := weeklyVolume(grown, ActivityRunning)
	_, heldVolume := weeklyVolume(held, ActivityRunning)
	// Sessions are rounded to 500 m, so totals land near the level.
	if got := grownVolume["2026-11-02"]; !near(got, 22000, 1000) {
		t.Errorf("expected 10%% growth to about 22 km, got %v", got)
	}
	if got := heldVolume["2026-11-02"]; !near(got, 20000, 1000) {
		t.Errorf("expected volume held at about 20 km, got %v", got)
	}
}

func TestGeneratePlan_EaseQuality(t *testing.T) {
	g := tenK()
	// Week 6 (Nov 23) is in build, with a tempo run.
	from := day("2026-11-23")
	normal := generate(t, generatorInput{Goal: g, From: from, PrevLevel: map[string]float64{ActivityRunning: 25000}})
	eased := generate(t, generatorInput{Goal: g, From: from, PrevLevel: map[string]float64{ActivityRunning: 25000}, EaseQuality: true})

	quality := func(sessions []PlannedSession, week string) int {
		n := 0
		for _, s := range sessions {
			if mondayOf(day(s.Date)).Format(dateLayout) == week && (s.Kind == KindTempo || s.Kind == KindIntervals) {
				n++
			}
		}
		return n
	}
	if quality(normal, "2026-11-23") != 1 || quality(eased, "2026-11-23") != 0 {
		t.Errorf("expected the tempo run eased in the first week only")
	}
	if quality(eased, "2026-11-30") != 1 {
		t.Errorf("expected quality back the week after")
	}
}
