//! Parsers for `SIMCom` A76xx response lines, kept apart from the transport so
//! they are tested on the host. Reference: `SIMCom` A76XX AT command manual
//! (`+CCLK`) and HTTP(S) application note (`+HTTPACTION`).

use guardian_protocol::time::UtcTime;

/// Years before this mean the modem never received network time: it reports
/// its power-on default (`70/01/01`, `80/01/06` depending on firmware).
const FIRST_PLAUSIBLE_YEAR: i32 = 2024;
/// `+CCLK` time zone unit: quarter hours.
const SECONDS_PER_QUARTER_HOUR: i64 = 15 * 60;

/// Parse `+CCLK: "yy/MM/dd,hh:mm:ss±zz"` (local time, zone in quarter hours)
/// into UTC.
///
/// Returns `None` for a malformed line or a clock that was never set by the
/// network, so a default date is never sent as if it were real.
#[must_use]
pub fn parse_cclk(line: &str) -> Option<UtcTime> {
    let quoted = line.strip_prefix("+CCLK:")?.trim();
    let text = quoted.strip_prefix('"')?.strip_suffix('"')?;
    let (date, rest) = text.split_once(',')?;
    if rest.len() != 11 {
        return None;
    }
    let (clock, zone) = rest.split_at(8);
    let [yy, mo, dd] = fields::<3>(date, '/')?;
    let [hh, mi, ss] = fields::<3>(clock, ':')?;
    let quarters: i64 = zone.parse().ok()?;
    // Two-digit years: the power-on defaults (70, 80) belong to the previous
    // century, real network dates to this one.
    let century = if yy >= 70 { 1900 } else { 2000 };
    let year = century + i32::from(yy);
    if year < FIRST_PLAUSIBLE_YEAR || !(-48..=56).contains(&quarters) {
        return None;
    }
    let local = UtcTime::from_civil(year, mo, dd, hh, mi, ss).ok()?;
    local.offset(-quarters * SECONDS_PER_QUARTER_HOUR).ok()
}

/// Result of `AT+HTTPACTION`, reported as an unsolicited line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HttpAction {
    /// 0 = GET, 1 = POST, 2 = HEAD.
    pub method: u8,
    /// HTTP status, or a `SIMCom` 7xx code for transport failures.
    pub status: u16,
    /// Response body length.
    pub length: u32,
}

impl HttpAction {
    /// Whether `status` is a real HTTP status (the server answered) rather
    /// than a `SIMCom` 7xx transport error (DNS, TLS, timeout...).
    #[must_use]
    pub fn reached_server(&self) -> bool {
        (100..600).contains(&self.status)
    }
}

/// Parse `+HTTPACTION: <method>,<status>,<length>`.
#[must_use]
pub fn parse_http_action(line: &str) -> Option<HttpAction> {
    let values = line.strip_prefix("+HTTPACTION:")?.trim();
    let mut parts = values.split(',').map(str::trim);
    let action = HttpAction {
        method: parts.next()?.parse().ok()?,
        status: parts.next()?.parse().ok()?,
        length: parts.next()?.parse().ok()?,
    };
    parts.next().is_none().then_some(action)
}

/// Split `text` into exactly `N` two-digit decimal fields.
fn fields<const N: usize>(text: &str, separator: char) -> Option<[u8; N]> {
    let mut out = [0; N];
    let mut parts = text.split(separator);
    for slot in &mut out {
        let part = parts.next()?;
        if part.len() != 2 || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        *slot = part.parse().ok()?;
    }
    parts.next().is_none().then_some(out)
}
