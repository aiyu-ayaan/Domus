//! Readings gathered between two stored samples. Every poll feeds a device's window and once per
//! sample interval the window becomes one row, so the database keeps the average and the peak of
//! readings it never stored one by one.

use std::time::{Duration, Instant};

/// Running average and maximum of one reading.
#[derive(Default, Clone, Copy)]
pub struct Stat {
    sum: f64,
    n: u32,
    max: f64,
}

impl Stat {
    pub fn add(&mut self, v: f64) {
        self.max = if self.n == 0 { v } else { self.max.max(v) };
        self.sum += v;
        self.n += 1;
    }

    pub fn mean(&self) -> Option<f64> {
        (self.n > 0).then(|| self.sum / self.n as f64)
    }

    pub fn max(&self) -> Option<f64> {
        (self.n > 0).then_some(self.max)
    }
}

pub struct Window {
    pub started: Instant,
    /// When power was last read. It outlives the window, so energy is integrated without gaps.
    power_at: Option<Instant>,
    pub kwh: f64,
    pub watts: Stat,
    /// The device's own counter for today, when it has one.
    pub meter_today: Option<f64>,
    pub pm25: Stat,
    pub temperature: Stat,
    pub humidity: Stat,
}

impl Window {
    pub fn new(now: Instant) -> Self {
        Self {
            started: now,
            power_at: None,
            kwh: 0.0,
            watts: Stat::default(),
            meter_today: None,
            pm25: Stat::default(),
            temperature: Stat::default(),
            humidity: Stat::default(),
        }
    }

    /// Adds a power reading. Its energy is `watts` over the time since the previous reading, at
    /// most `cap`: a longer silence is a gap, not usage.
    pub fn power(&mut self, now: Instant, watts: f64, meter_today: Option<f64>, cap: Duration) {
        let dt = self.power_at.map_or(Duration::ZERO, |t| now.duration_since(t).min(cap));
        self.power_at = Some(now);
        self.kwh += watts.max(0.0) * dt.as_secs_f64() / 3_600_000.0;
        self.watts.add(watts);
        self.meter_today = meter_today;
    }

    pub fn air(&mut self, pm25: f32, temperature: Option<f32>, humidity: Option<f32>) {
        self.pm25.add(pm25 as f64);
        if let Some(t) = temperature {
            self.temperature.add(t as f64);
        }
        if let Some(h) = humidity {
            self.humidity.add(h as f64);
        }
    }

    /// Hands over what was gathered and starts the next window; `None` when nothing was read.
    pub fn take(&mut self, now: Instant) -> Option<Window> {
        let next = Window { power_at: self.power_at, ..Window::new(now) };
        let done = std::mem::replace(self, next);
        (done.watts.n > 0 || done.pm25.n > 0).then_some(done)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_keeps_the_average_the_peak_and_the_energy_of_every_poll() {
        let t0 = Instant::now();
        let s = Duration::from_secs;
        let cap = s(60);
        let mut w = Window::new(t0);
        // A spike seen by one poll only.
        for (i, pm) in [20.0, 57.0, 22.0, 21.0].into_iter().enumerate() {
            w.air(pm, (i == 0).then_some(25.0), None);
        }
        w.power(t0, 1000.0, None, cap); // first reading: nothing to integrate yet
        w.power(t0 + s(3), 2000.0, Some(1.5), cap); // 2 kW for 3 s
        w.power(t0 + s(603), 1000.0, Some(1.6), cap); // ten silent minutes count as `cap`

        let done = w.take(t0 + s(603)).unwrap();
        assert_eq!((done.pm25.mean(), done.pm25.max()), (Some(30.0), Some(57.0)));
        assert_eq!((done.temperature.mean(), done.humidity.mean()), (Some(25.0), None));
        assert_eq!(done.watts.max(), Some(2000.0));
        assert!((done.kwh - (2.0 * 3.0 + 1.0 * 60.0) / 3600.0).abs() < 1e-9);
        assert_eq!(done.meter_today, Some(1.6));

        // The next window starts empty but still knows when power was last read.
        assert!(w.take(t0 + s(604)).is_none());
        w.power(t0 + s(606), 1000.0, None, cap);
        assert!((w.kwh - 3.0 / 3600.0).abs() < 1e-9);
    }
}
