import math

class RepCounter:
    def __init__(self, threshold=1200.0, min_rep_time=0.6, alpha=0.2):
        self.threshold = threshold
        self.min_rep_time = min_rep_time
        self.alpha = alpha

        self.filtered = 0.0
        self.state = "WAITING"
        self.last_rep_time = 0.0
        self.reps = 0

    def update(self, gx, gy, gz, t):
        mag = math.sqrt(gx*gx + gy*gy + gz*gz)
        self.filtered = self.alpha * mag + (1 - self.alpha) * self.filtered

        if self.state == "WAITING":
            if self.filtered > self.threshold:
                self.state = "MOVING"

        elif self.state == "MOVING":
            # drop below hysteresis to end the rep
            if self.filtered < self.threshold * 0.6:
                if (t - self.last_rep_time) >= self.min_rep_time:
                    self.reps += 1
                    self.last_rep_time = t
                self.state = "WAITING"

        return self.reps, self.filtered, self.state