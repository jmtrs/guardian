//! Acceleration samples and motion thresholds, in milli-g.
//!
//! Sensor-independent: register encodings belong to the sensor driver.

/// Gravity magnitude read by a sensor lying still.
pub const GRAVITY_MG: u32 = 1000;
/// Tolerance around [`GRAVITY_MG`] to consider a sample "at rest".
pub const AT_REST_TOLERANCE_MG: u32 = 150;

/// One three-axis acceleration sample, in milli-g.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Accel {
    /// X axis, mg.
    pub x: i16,
    /// Y axis, mg.
    pub y: i16,
    /// Z axis, mg.
    pub z: i16,
}

impl Accel {
    /// Build a sample from its three axes.
    #[must_use]
    pub const fn new(x: i16, y: i16, z: i16) -> Self {
        Self { x, y, z }
    }

    /// Euclidean magnitude, floored to whole mg.
    #[must_use]
    pub fn magnitude_mg(self) -> u32 {
        let square = |v: i16| u64::from(v.unsigned_abs()).pow(2);
        let magnitude = (square(self.x) + square(self.y) + square(self.z)).isqrt();
        // Bounded by sqrt(3) * 32768 < 2^16, always fits.
        u32::try_from(magnitude).unwrap_or(u32::MAX)
    }

    /// Whether the sample is consistent with a sensor lying still (~1 g).
    ///
    /// Used as a self-test: a healthy, correctly scaled accelerometer at rest
    /// reads 1 g ± [`AT_REST_TOLERANCE_MG`] whatever its orientation.
    #[must_use]
    pub fn is_at_rest(self) -> bool {
        self.magnitude_mg().abs_diff(GRAVITY_MG) <= AT_REST_TOLERANCE_MG
    }
}

/// A motion-interrupt threshold, guaranteed to be within the supported range.
///
/// The only way to build one is [`Threshold::clamped`] (or [`Default`]), so a
/// driver never receives an out-of-range value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Threshold(u16);

impl Threshold {
    /// Smallest threshold: one 16 mg step of a ±2 g, 7-bit register.
    pub const MIN: Self = Self(16);
    /// Largest threshold: 127 steps of 16 mg.
    pub const MAX: Self = Self(2032);
    /// Bench default. Field tuning happens in the vehicle, not here.
    pub const DEFAULT: Self = Self(80);

    /// Clamp a requested value (mg) into `[MIN, MAX]`.
    #[must_use]
    pub fn clamped(requested_mg: u32) -> Self {
        let mg = requested_mg.clamp(u32::from(Self::MIN.0), u32::from(Self::MAX.0));
        Self(u16::try_from(mg).unwrap_or(Self::MAX.0))
    }

    /// Value in milli-g.
    #[must_use]
    pub const fn mg(self) -> u16 {
        self.0
    }
}

impl Default for Threshold {
    fn default() -> Self {
        Self::DEFAULT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn magnitude_is_euclidean_floor() {
        assert_eq!(Accel::new(0, 0, 0).magnitude_mg(), 0);
        assert_eq!(Accel::new(3, 4, 0).magnitude_mg(), 5);
        assert_eq!(Accel::new(0, 0, -1000).magnitude_mg(), 1000);
        assert_eq!(
            Accel::new(i16::MIN, i16::MIN, i16::MIN).magnitude_mg(),
            56755
        );
    }

    #[test]
    fn at_rest_in_any_orientation() {
        for s in [
            Accel::new(0, 0, 1000),
            Accel::new(-1000, 0, 0),
            Accel::new(577, 577, 577),
            Accel::new(0, 0, 850),
            Accel::new(0, 0, 1150),
        ] {
            assert!(s.is_at_rest(), "{s:?}");
        }
    }

    #[test]
    fn not_at_rest_in_free_fall_or_shock() {
        for s in [
            Accel::new(0, 0, 0),
            Accel::new(0, 0, 849),
            Accel::new(0, 0, 1151),
            Accel::new(0, 0, 2000),
        ] {
            assert!(!s.is_at_rest(), "{s:?}");
        }
    }

    #[test]
    fn threshold_is_clamped() {
        assert_eq!(Threshold::clamped(0), Threshold::MIN);
        assert_eq!(Threshold::clamped(80).mg(), 80);
        assert_eq!(Threshold::clamped(u32::MAX), Threshold::MAX);
        assert_eq!(Threshold::default(), Threshold::DEFAULT);
    }
}
