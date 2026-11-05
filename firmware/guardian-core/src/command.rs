//! Operator command language of the bring-up console.
//!
//! Grammar: `line := blank | '!' word [number] | at-line`. Lines starting with
//! `!` are local commands; any other non-empty line is forwarded verbatim to
//! the modem as an AT command. Parsing is pure and never fails: malformed input
//! maps to [`Command::Unknown`] or [`Command::InvalidArgument`].

use crate::accel::Threshold;

/// A parsed console line. Borrowed text points into the input line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command<'a> {
    /// Blank line: nothing to do.
    Empty,
    /// `!help` (or a bare `!`).
    Help,
    /// `!diag`: board + modem identity, SIM, signal and registration.
    Diag,
    /// `!modem on`.
    ModemOn,
    /// `!modem off`.
    ModemOff,
    /// `!gnss`: start the GNSS engine.
    Gnss,
    /// `!lis`: accelerometer self-test.
    Sensor,
    /// `!arm [mg]`: watch the motion interrupt while awake.
    Arm(Threshold),
    /// `!sleep [mg]`: deep sleep until motion, modem off (power test P1).
    Sleep(Threshold),
    /// `!standby [mg]`: deep sleep until motion, modem registered in its own
    /// LTE sleep (power test P2).
    Standby(Threshold),
    /// `!vbat`: battery rail.
    Battery,
    /// `!event`: sign and send one heartbeat to the backend (step 7).
    Event,
    /// `!provision <device-id> <root-secret-hex>`: store the identity.
    Provision {
        /// Device id as printed at provisioning.
        device_id: &'a str,
        /// `K_root`, 64 hex digits.
        secret: &'a str,
    },
    /// Not a `!` line: send to the modem as-is (leading spaces trimmed).
    At(&'a str),
    /// `!` followed by an unrecognised word.
    Unknown(&'a str),
    /// Known command with a malformed or unexpected argument.
    InvalidArgument(&'a str),
}

impl<'a> Command<'a> {
    /// Parse one console line (without CR/LF).
    #[must_use]
    pub fn parse(line: &'a str) -> Self {
        let line = line.trim();
        match line.strip_prefix('!') {
            None if line.is_empty() => Self::Empty,
            None => Self::At(line),
            Some(local) => Self::parse_local(local.trim_start()),
        }
    }

    fn parse_local(text: &'a str) -> Self {
        let (word, rest) = text.split_once(char::is_whitespace).unwrap_or((text, ""));
        let rest = rest.trim();
        match word {
            "" | "help" => Self::no_argument(Self::Help, rest),
            "diag" => Self::no_argument(Self::Diag, rest),
            "gnss" => Self::no_argument(Self::Gnss, rest),
            "lis" => Self::no_argument(Self::Sensor, rest),
            "vbat" => Self::no_argument(Self::Battery, rest),
            "event" => Self::no_argument(Self::Event, rest),
            "provision" => Self::provision(rest),
            "arm" => Self::threshold(rest).map_or(Self::InvalidArgument(rest), Self::Arm),
            "sleep" => Self::threshold(rest).map_or(Self::InvalidArgument(rest), Self::Sleep),
            "standby" => Self::threshold(rest).map_or(Self::InvalidArgument(rest), Self::Standby),
            "modem" => match rest {
                "on" => Self::ModemOn,
                "off" => Self::ModemOff,
                other => Self::InvalidArgument(other),
            },
            other => Self::Unknown(other),
        }
    }

    /// Exactly two words. The error never echoes the input: it may hold the
    /// secret.
    fn provision(rest: &'a str) -> Self {
        let mut words = rest.split_whitespace();
        match (words.next(), words.next(), words.next()) {
            (Some(device_id), Some(secret), None) => Self::Provision { device_id, secret },
            _ => Self::InvalidArgument("expected: !provision <device-id> <secret-hex>"),
        }
    }

    fn no_argument(command: Self, rest: &'a str) -> Self {
        if rest.is_empty() {
            command
        } else {
            Self::InvalidArgument(rest)
        }
    }

    /// Optional unsigned decimal threshold; at most 5 digits, nothing after it.
    fn threshold(rest: &str) -> Option<Threshold> {
        if rest.is_empty() {
            return Some(Threshold::DEFAULT);
        }
        let digits_only = rest.len() <= 5 && rest.bytes().all(|b| b.is_ascii_digit());
        digits_only
            .then(|| rest.parse().ok())
            .flatten()
            .map(Threshold::clamped)
    }
}

/// Whether an AT line switches the modem off (`AT+CPOF`, `AT+CPOWD...`).
///
/// Lets the service keep its power state truthful when the operator powers
/// the modem down through passthrough. Case-insensitive, surrounding spaces
/// ignored.
#[must_use]
pub fn at_powers_down(line: &str) -> bool {
    let line = line.trim_start().as_bytes();
    [b"AT+CPOF".as_slice(), b"AT+CPOWD"].iter().any(|prefix| {
        line.len() >= prefix.len() && line[..prefix.len()].eq_ignore_ascii_case(prefix)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_and_passthrough() {
        assert_eq!(Command::parse(""), Command::Empty);
        assert_eq!(Command::parse("   "), Command::Empty);
        assert_eq!(Command::parse("  AT+CSQ"), Command::At("AT+CSQ"));
    }

    #[test]
    fn simple_commands() {
        assert_eq!(Command::parse("!"), Command::Help);
        assert_eq!(Command::parse("!help"), Command::Help);
        assert_eq!(Command::parse("!diag"), Command::Diag);
        assert_eq!(Command::parse(" ! gnss "), Command::Gnss);
        assert_eq!(Command::parse("!lis"), Command::Sensor);
        assert_eq!(Command::parse("!vbat"), Command::Battery);
        assert_eq!(Command::parse("!event"), Command::Event);
        assert_eq!(
            Command::parse("!provision dev-1  abcd"),
            Command::Provision {
                device_id: "dev-1",
                secret: "abcd"
            }
        );
        for bad in ["!provision", "!provision dev-1", "!provision a b c"] {
            assert_eq!(
                Command::parse(bad),
                Command::InvalidArgument("expected: !provision <device-id> <secret-hex>"),
                "{bad}"
            );
        }
        assert_eq!(Command::parse("!modem on"), Command::ModemOn);
        assert_eq!(Command::parse("!modem  off"), Command::ModemOff);
    }

    #[test]
    fn thresholds_default_and_clamp() {
        assert_eq!(Command::parse("!arm"), Command::Arm(Threshold::DEFAULT));
        assert_eq!(
            Command::parse("!sleep 120"),
            Command::Sleep(Threshold::clamped(120))
        );
        assert_eq!(
            Command::parse("!standby"),
            Command::Standby(Threshold::DEFAULT)
        );
        assert_eq!(Command::parse("!arm 1"), Command::Arm(Threshold::MIN));
        assert_eq!(Command::parse("!arm 99999"), Command::Arm(Threshold::MAX));
    }

    #[test]
    fn malformed_input() {
        for (line, arg) in [
            ("!arm abc", "abc"),
            ("!arm -5", "-5"),
            ("!arm 100000", "100000"),
            ("!arm 80 90", "80 90"),
            ("!modem", ""),
            ("!modem maybe", "maybe"),
            ("!diag now", "now"),
            ("!standby lte", "lte"),
        ] {
            assert_eq!(
                Command::parse(line),
                Command::InvalidArgument(arg),
                "{line}"
            );
        }
        assert_eq!(Command::parse("!reboot"), Command::Unknown("reboot"));
    }

    #[test]
    fn power_down_detection() {
        assert!(at_powers_down("AT+CPOF"));
        assert!(at_powers_down("  at+cpowd=1"));
        assert!(!at_powers_down("AT+CPIN?"));
        assert!(!at_powers_down("AT+CPO"));
        assert!(!at_powers_down(""));
    }
}
