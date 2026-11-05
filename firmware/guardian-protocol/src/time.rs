//! UTC timestamps without a clock library.
//!
//! The device learns the time from the network or GNSS as calendar fields;
//! the contract wants ISO 8601 with an explicit `Z`. Calendar ↔ day-count
//! conversions are Howard Hinnant's `days_from_civil` / `civil_from_days`
//! (proleptic Gregorian, exact for every date handled here).

use core::fmt;

use crate::ProtocolError;

const SECONDS_PER_DAY: i64 = 86_400;

/// A UTC instant with one-second resolution, 1970 or later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct UtcTime {
    unix: i64,
}

impl UtcTime {
    /// Build from UTC calendar fields.
    ///
    /// # Errors
    /// [`ProtocolError::Time`] for out-of-range fields (including day 31 of a
    /// 30-day month) or a date before 1970.
    pub fn from_civil(
        year: i32,
        month: u8,
        day: u8,
        hour: u8,
        minute: u8,
        second: u8,
    ) -> Result<Self, ProtocolError> {
        let valid = (1..=12).contains(&month)
            && day >= 1
            && day <= days_in_month(year, month)
            && hour < 24
            && minute < 60
            && second < 60;
        if !valid {
            return Err(ProtocolError::Time);
        }
        let seconds = i64::from(hour) * 3600 + i64::from(minute) * 60 + i64::from(second);
        Self::from_unix(days_from_civil(year, month, day) * SECONDS_PER_DAY + seconds)
    }

    /// Build from seconds since 1970-01-01T00:00:00Z.
    ///
    /// # Errors
    /// [`ProtocolError::Time`] if negative.
    pub fn from_unix(unix: i64) -> Result<Self, ProtocolError> {
        if unix < 0 {
            return Err(ProtocolError::Time);
        }
        Ok(Self { unix })
    }

    /// Seconds since 1970-01-01T00:00:00Z.
    #[must_use]
    pub fn unix(self) -> i64 {
        self.unix
    }

    /// Shift by `seconds` (negative = earlier), e.g. local time → UTC.
    ///
    /// # Errors
    /// [`ProtocolError::Time`] if the result is before 1970.
    pub fn offset(self, seconds: i64) -> Result<Self, ProtocolError> {
        Self::from_unix(self.unix + seconds)
    }
}

/// ISO 8601, `YYYY-MM-DDTHH:MM:SSZ`.
impl fmt::Display for UtcTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (year, month, day) = civil_from_days(self.unix.div_euclid(SECONDS_PER_DAY));
        let second_of_day = self.unix.rem_euclid(SECONDS_PER_DAY);
        write!(
            f,
            "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
            second_of_day / 3600,
            second_of_day / 60 % 60,
            second_of_day % 60
        )
    }
}

fn is_leap(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        2 if is_leap(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Days since 1970-01-01 for a valid date.
fn days_from_civil(year: i32, month: u8, day: u8) -> i64 {
    let year = i64::from(year) - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month = i64::from(month);
    let day_of_year = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + i64::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Calendar date of a day count since 1970-01-01.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}
