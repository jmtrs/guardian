//! UTC conversions against known instants.

use guardian_protocol::time::UtcTime;
use guardian_protocol::ProtocolError;

#[test]
fn epoch_and_known_instants() {
    assert_eq!(UtcTime::from_civil(1970, 1, 1, 0, 0, 0).unwrap().unix(), 0);
    // date -u -d 2026-11-05T11:30:00Z +%s
    let t = UtcTime::from_civil(2026, 11, 5, 11, 30, 0).unwrap();
    assert_eq!(t.unix(), 1_793_878_200);
    assert_eq!(t.to_string(), "2026-11-05T11:30:00Z");
}

#[test]
fn leap_days_round_trip() {
    let t = UtcTime::from_civil(2028, 2, 29, 23, 59, 59).unwrap();
    assert_eq!(t.to_string(), "2028-02-29T23:59:59Z");
    assert_eq!(t.offset(1).unwrap().to_string(), "2028-03-01T00:00:00Z");
    assert_eq!(
        UtcTime::from_civil(2026, 2, 29, 0, 0, 0),
        Err(ProtocolError::Time)
    );
    assert!(UtcTime::from_civil(2000, 2, 29, 0, 0, 0).is_ok());
    assert_eq!(
        UtcTime::from_civil(2100, 2, 29, 0, 0, 0),
        Err(ProtocolError::Time)
    );
}

#[test]
fn local_to_utc_across_midnight_and_year() {
    // 00:30 on 1 Jan, local UTC+1 -> 23:30 on 31 Dec UTC.
    let local = UtcTime::from_civil(2027, 1, 1, 0, 30, 0).unwrap();
    assert_eq!(
        local.offset(-3600).unwrap().to_string(),
        "2026-12-31T23:30:00Z"
    );
}

#[test]
fn rejects_out_of_range_fields() {
    for (mo, d, h, mi, s) in [
        (0, 1, 0, 0, 0),
        (13, 1, 0, 0, 0),
        (4, 31, 0, 0, 0),
        (1, 1, 24, 0, 0),
        (1, 1, 0, 60, 0),
        (1, 1, 0, 0, 60),
        (1, 0, 0, 0, 0),
    ] {
        assert_eq!(
            UtcTime::from_civil(2026, mo, d, h, mi, s),
            Err(ProtocolError::Time),
            "{mo}/{d} {h}:{mi}:{s}"
        );
    }
    assert_eq!(
        UtcTime::from_civil(1969, 12, 31, 23, 59, 59),
        Err(ProtocolError::Time)
    );
}
