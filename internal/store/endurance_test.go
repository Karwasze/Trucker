package store

import (
	"slices"
	"strings"
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

	// Without history, intensity is a heart rate zone alone.
	for _, s := range sessions {
		if s.SpeedMin != nil || s.HRMin != nil {
			t.Errorf("expected no targets without history, got %+v", s)
			break
		}
	}
	for _, s := range sessions {
		if s.Kind == KindLong {
			if !strings.HasSuffix(s.Description, " · zone 2") || s.Intensity != "Z2" {
				t.Errorf("expected a long run in zone 2, got %q (%s)", s.Description, s.Intensity)
			}
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
	f := Fitness{Threshold: map[string]float64{ActivityRunning: 10000 / 3127.6}}
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate), Fitness: f})

	easy := sessions[0]
	if easy.Kind != KindEasy {
		t.Fatalf("expected an easy run first, got %+v", easy)
	}
	// Easy goes by a zone of the Fitness app, without a pace or bpm range.
	if easy.SpeedMin != nil || easy.HRMin != nil || easy.Intensity != "Z2" || !strings.HasSuffix(easy.Description, " · zone 2") {
		t.Errorf("expected zone 2 without a pace or bpm range, got %+v", easy)
	}
	for _, s := range sessions {
		if s.Kind == KindIntervals {
			if want := "Intervals 4×800 m @ 4:53–5:03/km (zone 4), 2 min jog · 6.5 km in all"; s.Description != want {
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

func TestGeneratePlan_LongPlanRampsUpToPeakPhase(t *testing.T) {
	g := tenK()
	g.RaceDate = "2027-05-16" // 30 weeks
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate)})

	weeks, volume := weeklyVolume(sessions, ActivityRunning)
	phase := make(map[string]string)
	for _, s := range sessions {
		phase[mondayOf(day(s.Date)).Format(dateLayout)] = s.Phase
	}
	peak := 0.0
	for _, v := range volume {
		peak = max(peak, v)
	}
	// Each non-recovery week of base and build grows on the last one, and
	// the peak volume isn't reached before the peak phase.
	prev := 0.0
	for i, w := range weeks {
		if phase[w] != PhaseBase && phase[w] != PhaseBuild {
			continue
		}
		if (i+1)%4 == 0 {
			continue
		}
		if volume[w] < prev {
			t.Errorf("week %s drops from %v to %v", w, prev, volume[w])
		}
		prev = volume[w]
		if volume[w] >= peak {
			t.Errorf("week %s (%s) already at the peak volume %v", w, phase[w], peak)
		}
	}
	if first, last := volume[weeks[0]], prev; last < first*1.6 {
		t.Errorf("expected base and build to ramp up well, got %v to %v", first, last)
	}
	for i, w := range weeks {
		if phase[w] == PhasePeak && (i+1)%4 != 0 && !near(volume[w], peak, 1500) {
			t.Errorf("expected peak week %s near the peak volume %v, got %v", w, peak, volume[w])
		}
	}
}

func TestGeneratePlan_HalfTriathlonRidesFromLowStart(t *testing.T) {
	g := Goal{
		Name: "Half triathlon", StartDate: "2026-10-19", RaceDate: "2027-04-04", // 24 weeks
		SwimM: fp(1900), BikeM: fp(90000), RunM: fp(21097),
		Weekdays: []string{"tuesday", "thursday", "saturday", "sunday"}, LongDay: "sunday",
	}
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate)})

	firstLong, longest := 0.0, 0.0
	for _, s := range sessions {
		if s.Activity != ActivityCycling || s.Kind != KindLong {
			continue
		}
		if firstLong == 0 {
			firstLong = *s.TargetDistanceM
		}
		longest = max(longest, *s.TargetDistanceM)
	}
	// Without history, a long plan has time to start well below the peak.
	if firstLong > 40000 {
		t.Errorf("expected the first long ride at 40 km or less, got %v", firstLong)
	}
	if longest < 85000 || longest > 100000 {
		t.Errorf("expected the long ride to peak around the 90 km race leg, got %v", longest)
	}
}

func TestGeneratePlan_ThreeDayTriathlon(t *testing.T) {
	g := Goal{
		Name: "Half triathlon", StartDate: "2026-10-19", RaceDate: "2027-04-04",
		SwimM: fp(1900), BikeM: fp(90000), RunM: fp(21097),
		Weekdays: []string{"tuesday", "thursday", "sunday"}, LongDay: "sunday",
	}
	sessions, warnings := generatePlan(generatorInput{Goal: g, From: day(g.StartDate)})

	// One session a sport: each is the long one, with a brick after the
	// long ride in build and peak.
	kinds := make(map[string]map[string]int)
	for _, s := range sessions {
		if kinds[s.Phase] == nil {
			kinds[s.Phase] = make(map[string]int)
		}
		kinds[s.Phase][s.Kind]++
	}
	for _, phase := range []string{PhaseBase, PhaseBuild, PhasePeak} {
		if kinds[phase][KindEasy] > 0 || kinds[phase][KindLong] == 0 {
			t.Errorf("expected long sessions, not easy ones, in %s: %v", phase, kinds[phase])
		}
	}
	if kinds[PhaseBuild][KindBrick] == 0 || kinds[PhasePeak][KindBrick] == 0 {
		t.Errorf("expected bricks in build and peak, got %v", kinds)
	}

	// Rides and runs carry a tempo block in build and intervals in peak;
	// swims stay steady, and so do base and recovery weeks.
	for _, s := range sessions {
		week := int(day(s.Date).Sub(day(g.StartDate)).Hours() / 24 / 7)
		if s.Kind != KindLong || (week+1)%4 == 0 {
			continue
		}
		tempo := strings.Contains(s.Description, "in the middle")
		intervals := strings.Contains(s.Description, "×")
		wantTempo := s.Phase == PhaseBuild && s.Activity != ActivitySwimming
		wantIntervals := s.Phase == PhasePeak && s.Activity != ActivitySwimming
		if tempo != wantTempo || intervals != wantIntervals {
			t.Errorf("%s %s on %s: got %q", s.Phase, s.Activity, s.Date, s.Description)
		}
		// The tempo block is kept to be checked, a third of the session.
		if tempo != (s.TempoBlock != nil) {
			t.Errorf("%s %s on %s: expected a tempo block with %q, got %+v", s.Phase, s.Activity, s.Date, s.Description, s.TempoBlock)
		} else if tempo && s.TempoBlock.DistanceM != roundDistance(s.Activity, *s.TargetDistanceM/3) {
			t.Errorf("expected a third of %v in the block, got %v", *s.TargetDistanceM, s.TempoBlock.DistanceM)
		}
	}

	if len(warnings) != 1 || !strings.Contains(warnings[0], "one session a sport") {
		t.Errorf("expected a warning about one session a sport, got %v", warnings)
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

func TestNewSession_HeartRateZones(t *testing.T) {
	// Zones are numbered as in the Fitness app.
	cases := []struct {
		activity, kind, zone, description string
	}{
		{ActivityRunning, KindRecovery, "Z1", "Recovery run 4 km · zone 1"},
		{ActivityRunning, KindLong, "Z2", "Long run 6 km · zone 2"},
		{ActivityCycling, KindEasy, "Z2", "Easy ride 30 km · zone 2"},
		{ActivityRunning, KindTempo, "Z3", "Tempo run 8 km: the middle half @ zone 3"},
		{ActivityRunning, KindBrick, "Z3", "Brick run 3 km straight off the bike · zone 3"},
	}
	for _, c := range cases {
		distance := map[string]float64{KindRecovery: 4000, KindLong: 6000, KindEasy: 30000, KindTempo: 8000, KindBrick: 3000}[c.kind]
		s := newSession(c.activity, c.kind, PhaseBuild, distance, Fitness{})
		if s.Intensity != c.zone || s.Description != c.description {
			t.Errorf("%s %s: expected %s %q, got %s %q", c.activity, c.kind, c.zone, c.description, s.Intensity, s.Description)
		}
	}
	intervals := newSession(ActivityRunning, KindIntervals, PhasePeak, 8000, Fitness{})
	if intervals.Intensity != "Z4" || !strings.Contains(intervals.Description, "@ zone 4,") {
		t.Errorf("expected intervals in zone 4, got %s %q", intervals.Intensity, intervals.Description)
	}
}

// halfTri is a half triathlon on three days a week, as first planned on
// Friday Oct 16 2026 for Sunday Apr 4 2027, from a brick of a 975 m swim,
// a 45 km ride and a 10.6 km run.
func halfTri() (Goal, Fitness) {
	g := Goal{
		Name: "Half triathlon", StartDate: "2026-10-16", RaceDate: "2027-04-04",
		SwimM: fp(1900), BikeM: fp(90000), RunM: fp(21097),
		Weekdays: []string{"tuesday", "thursday", "sunday"}, LongDay: "sunday",
	}
	f := Fitness{
		Weekly:    map[string]float64{ActivitySwimming: 244, ActivityCycling: 11292, ActivityRunning: 2648},
		Longest:   map[string]float64{ActivitySwimming: 975, ActivityCycling: 45168, ActivityRunning: 10591},
		Threshold: map[string]float64{ActivitySwimming: 700 / 1308.7, ActivityCycling: 45168 / 8186.0, ActivityRunning: 10000 / 5059.0},
	}
	return g, f
}

func TestGeneratePlan_TriathlonEasyByZone(t *testing.T) {
	g, f := halfTri()
	for _, s := range generate(t, generatorInput{Goal: g, From: day(g.StartDate), Fitness: f}) {
		if s.Kind != KindLong && s.Kind != KindEasy && s.Kind != KindRecovery {
			continue
		}
		// Easy efforts go by heart rate zone alone; blocks keep their pace.
		if s.SpeedMin != nil || s.SpeedMax != nil {
			t.Errorf("expected no speed range on %s %s %s, got %q", s.Date, s.Activity, s.Kind, s.Description)
		}
		if !strings.Contains(s.Description, " · zone 2") && !strings.Contains(s.Description, " · zone 1") {
			t.Errorf("expected a zone on %s, got %q", s.Date, s.Description)
		}
		if s.TempoBlock != nil && s.TempoBlock.SpeedMin == nil {
			t.Errorf("expected the tempo block on %s paced, got %+v", s.Date, s.TempoBlock)
		}
	}
}

func TestGeneratePlan_TriathlonLongRunCap(t *testing.T) {
	g, f := halfTri()
	longest := 0.0
	for _, s := range generate(t, generatorInput{Goal: g, From: day(g.StartDate), Fitness: f}) {
		if s.Activity == ActivityRunning && s.Kind == KindLong {
			longest = max(longest, *s.TargetDistanceM)
		}
	}
	// 85% of the 21.1 km run leg, as the race run comes off the bike.
	if longest != 18000 {
		t.Errorf("expected the long run to peak at 18 km, got %v", longest)
	}
}

func TestGeneratePlan_TriathlonPeakAlternates(t *testing.T) {
	g, f := halfTri()
	sessions := generate(t, generatorInput{Goal: g, From: day(g.StartDate), Fitness: f})

	for _, activity := range []string{ActivityCycling, ActivityRunning} {
		longest := 0.0
		for _, s := range sessions {
			if s.Activity == activity && s.Kind == KindLong {
				longest = max(longest, *s.TargetDistanceM)
			}
		}
		// Peak weeks (Feb 15, Feb 22 recovery, Mar 1, Mar 8) don't go the
		// longest twice in a row, ending on the longest.
		var full []string
		for _, s := range sessions {
			if s.Activity == activity && s.Kind == KindLong && *s.TargetDistanceM == longest {
				full = append(full, s.Date)
			}
		}
		if len(full) != 2 || full[len(full)-1] < "2027-03-08" {
			t.Errorf("expected the longest %s twice, last in the last peak week, got %v", activity, full)
		}
	}
}

func TestGeneratePlan_TriathlonBricksGrow(t *testing.T) {
	g, f := halfTri()
	var bricks []float64
	for _, s := range generate(t, generatorInput{Goal: g, From: day(g.StartDate), Fitness: f}) {
		if s.Kind == KindBrick {
			bricks = append(bricks, *s.TargetDistanceM)
		}
	}
	if len(bricks) < 2 || bricks[0] > 4500 || slices.Max(bricks) < 6000 {
		t.Errorf("expected bricks growing from about 4 km to 6 km or more, got %v", bricks)
	}
}

func TestRaceWeek_TriathlonRunsBeforeRace(t *testing.T) {
	g, f := halfTri()
	sessions := generate(t, generatorInput{Goal: g, From: day("2027-03-29"), Fitness: f})

	byActivity := make(map[string][]PlannedSession)
	for _, s := range sessions {
		if s.Kind != KindRace {
			byActivity[s.Activity] = append(byActivity[s.Activity], s)
		}
	}
	// Two days for three legs: the run goes straight off the ride.
	for _, activity := range legOrder {
		if len(byActivity[activity]) != 1 {
			t.Fatalf("expected one %s before the race, got %+v", activity, sessions)
		}
	}
	run, ride := byActivity[ActivityRunning][0], byActivity[ActivityCycling][0]
	if run.Date != ride.Date || run.Kind != KindBrick || *run.TargetDistanceM != 3000 {
		t.Errorf("expected a 3 km run off the ride on %s, got %+v", ride.Date, run)
	}
}
