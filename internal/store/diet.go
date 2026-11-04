package store

import (
	"database/sql"
	"errors"
	"strings"
	"time"
)

const (
	// Adherence is summed up over the last dietRecentDays, today included.
	dietRecentDays = 30
	// The weekday missed most is looked for over a longer stretch, since
	// each weekday comes round only once a week.
	dietPatternDays = 90
	// A weekday needs this many misses to stand out.
	dietMinWeekdayMisses = 2
	// Weigh-ins closer together than this say more about water than diet.
	dietMinBodyweightDays = 7
)

// DietDay records whether the diet was kept to on Date (YYYY-MM-DD).
type DietDay struct {
	Date    string `json:"date"`
	Adhered bool   `json:"adhered"`
}

// DietInsights sums up the diet up to and including a day.
type DietInsights struct {
	// CurrentStreak counts the days kept to in a row up to today, or up to
	// yesterday while today isn't logged yet.
	CurrentStreak int            `json:"current_streak"`
	LongestStreak int            `json:"longest_streak"`
	Recent        DietAdherence  `json:"recent"`
	MostMissed    *WeekdayMisses `json:"most_missed,omitempty"`
	// Bodyweight is how it changed over the last Recent.Days days.
	Bodyweight *BodyweightChange `json:"bodyweight,omitempty"`
	// FirstDate is the oldest day logged, if any.
	FirstDate *string `json:"first_date,omitempty"`
}

// DietAdherence counts, over the last Days days, those logged and those
// kept to.
type DietAdherence struct {
	Days    int `json:"days"`
	Logged  int `json:"logged"`
	Adhered int `json:"adhered"`
}

// WeekdayMisses is the weekday (e.g. "monday") the diet slipped on most:
// Missed of the Logged times it came round.
type WeekdayMisses struct {
	Weekday string `json:"weekday"`
	Missed  int    `json:"missed"`
	Logged  int    `json:"logged"`
}

// BodyweightChange is the change in kg between the first and last weigh-in
// in a stretch.
type BodyweightChange struct {
	From     string  `json:"from"`
	To       string  `json:"to"`
	ChangeKg float64 `json:"change_kg"`
}

// SaveDietDay records a day, replacing any earlier record of it.
func (s *Store) SaveDietDay(day DietDay) error {
	_, err := s.db.Exec(`
		INSERT INTO diet_days (date, adhered) VALUES (?, ?)
		ON CONFLICT(date) DO UPDATE SET adhered = excluded.adhered
	`, day.Date, day.Adhered)
	return err
}

// ListDietDays returns the days from from to to (YYYY-MM-DD, inclusive;
// either "" for no limit), oldest first.
func (s *Store) ListDietDays(from, to string) ([]DietDay, error) {
	query := "SELECT date, adhered FROM diet_days"
	var where []string
	var args []any
	if from != "" {
		where = append(where, "date >= ?")
		args = append(args, from)
	}
	if to != "" {
		where = append(where, "date <= ?")
		args = append(args, to)
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	rows, err := s.db.Query(query+" ORDER BY date", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	days := []DietDay{}
	for rows.Next() {
		var d DietDay
		if err := rows.Scan(&d.Date, &d.Adhered); err != nil {
			return nil, err
		}
		days = append(days, d)
	}
	return days, rows.Err()
}

// DeleteDietDay removes the record of a day.
func (s *Store) DeleteDietDay(date string) error {
	_, err := s.db.Exec("DELETE FROM diet_days WHERE date = ?", date)
	return err
}

// DietInsights sums up the diet up to and including today (YYYY-MM-DD).
func (s *Store) DietInsights(today string) (DietInsights, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return DietInsights{}, err
	}
	days, err := s.ListDietDays("", today)
	if err != nil {
		return DietInsights{}, err
	}
	weights, err := s.ListBodyweight()
	if err != nil {
		return DietInsights{}, err
	}

	byDate := make(map[string]DietDay, len(days))
	for _, d := range days {
		byDate[d.Date] = d
	}
	since := func(n int) string { return now.AddDate(0, 0, 1-n).Format(dateLayout) }

	insights := DietInsights{
		CurrentStreak: currentDietStreak(byDate, now),
		LongestStreak: longestDietStreak(days),
		Recent:        DietAdherence{Days: dietRecentDays},
		MostMissed:    mostMissedWeekday(days, since(dietPatternDays)),
		Bodyweight:    bodyweightChange(weights, since(dietRecentDays), today),
	}
	if len(days) > 0 {
		insights.FirstDate = &days[0].Date
	}
	for _, d := range days {
		if d.Date < since(dietRecentDays) {
			continue
		}
		insights.Recent.Logged++
		if d.Adhered {
			insights.Recent.Adhered++
		}
	}
	return insights, nil
}

// currentDietStreak counts the days kept to in a row back from now, or from
// the day before while now isn't logged.
func currentDietStreak(byDate map[string]DietDay, now time.Time) int {
	day := now
	if _, logged := byDate[day.Format(dateLayout)]; !logged {
		day = day.AddDate(0, 0, -1)
	}
	streak := 0
	for {
		d, logged := byDate[day.Format(dateLayout)]
		if !logged || !d.Adhered {
			return streak
		}
		streak++
		day = day.AddDate(0, 0, -1)
	}
}

// longestDietStreak is the most days kept to in a row, days oldest first.
// A day not logged breaks a streak, like one missed.
func longestDietStreak(days []DietDay) int {
	longest, streak := 0, 0
	var last time.Time
	for _, d := range days {
		date, err := time.Parse(dateLayout, d.Date)
		if err != nil || !d.Adhered {
			streak = 0
			continue
		}
		if streak > 0 && date.Sub(last) == 24*time.Hour {
			streak++
		} else {
			streak = 1
		}
		last = date
		longest = max(longest, streak)
	}
	return longest
}

// mostMissedWeekday is the weekday missed most often from from on, or nil
// if none was missed dietMinWeekdayMisses times. A tie goes to the weekday
// missed the larger share of times, then to the earlier in the week.
func mostMissedWeekday(days []DietDay, from string) *WeekdayMisses {
	var missed, logged [7]int
	for _, d := range days {
		date, err := time.Parse(dateLayout, d.Date)
		if err != nil || d.Date < from {
			continue
		}
		// Monday first.
		i := (int(date.Weekday()) + 6) % 7
		logged[i]++
		if !d.Adhered {
			missed[i]++
		}
	}
	best := -1
	for i := range 7 {
		if missed[i] < dietMinWeekdayMisses {
			continue
		}
		if best < 0 || missed[i] > missed[best] ||
			(missed[i] == missed[best] && missed[i]*logged[best] > missed[best]*logged[i]) {
			best = i
		}
	}
	if best < 0 {
		return nil
	}
	weekday := time.Weekday((best + 1) % 7)
	return &WeekdayMisses{
		Weekday: strings.ToLower(weekday.String()),
		Missed:  missed[best],
		Logged:  logged[best],
	}
}

// bodyweightChange is the change between the first and last weigh-in from
// from to to, entries oldest first, or nil if they're less than
// dietMinBodyweightDays apart.
func bodyweightChange(entries []BodyweightEntry, from, to string) *BodyweightChange {
	var first, last *BodyweightEntry
	for i := range entries {
		e := &entries[i]
		if e.Date < from || e.Date > to {
			continue
		}
		if first == nil {
			first = e
		}
		last = e
	}
	if first == nil {
		return nil
	}
	start, _ := time.Parse(dateLayout, first.Date)
	end, _ := time.Parse(dateLayout, last.Date)
	if end.Sub(start) < dietMinBodyweightDays*24*time.Hour {
		return nil
	}
	return &BodyweightChange{From: first.Date, To: last.Date, ChangeKg: round(last.Weight-first.Weight, 1)}
}

// TargetWeight returns the bodyweight (kg) the diet aims for, or nil if
// none is set.
func (s *Store) TargetWeight() (*float64, error) {
	var target sql.NullFloat64
	err := s.db.QueryRow("SELECT target_weight_kg FROM diet_settings WHERE id = 1").Scan(&target)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !target.Valid) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &target.Float64, nil
}

// SetTargetWeight sets the bodyweight (kg) the diet aims for, or clears it
// for nil.
func (s *Store) SetTargetWeight(kg *float64) error {
	_, err := s.db.Exec(`
		INSERT INTO diet_settings (id, target_weight_kg) VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET target_weight_kg = excluded.target_weight_kg
	`, kg)
	return err
}
