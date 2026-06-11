package store

import (
	"fmt"
	"testing"
)

func TestCalculate1RM(t *testing.T) {
	tests := []struct {
		weight float64
		reps   int
		want   float64
	}{
		{100, 1, 100},
		{100, 5, 112.5},  // 100 * 36/32
		{80, 10, 106.67}, // 80 * 36/27
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%.0fx%d", tt.weight, tt.reps), func(t *testing.T) {
			got := calculate1RM(tt.weight, tt.reps)
			diff := got - tt.want
			if diff < -0.01 || diff > 0.01 {
				t.Errorf("calculate1RM(%.0f, %d) = %.2f, want %.2f", tt.weight, tt.reps, got, tt.want)
			}
		})
	}
}
