//! `SIMCom` response parsers.

use guardian_drivers::simcom::{parse_cclk, parse_http_action, HttpAction};

#[test]
fn cclk_local_time_becomes_utc() {
    // Spain in winter: UTC+1 = +04 quarter hours.
    let t = parse_cclk(r#"+CCLK: "26/11/05,12:30:00+04""#).unwrap();
    assert_eq!(t.to_string(), "2026-11-05T11:30:00Z");
    // Negative zone, crossing midnight forward.
    let t = parse_cclk(r#"+CCLK: "26/12/31,22:00:00-08""#).unwrap();
    assert_eq!(t.to_string(), "2027-01-01T00:00:00Z");
}

#[test]
fn cclk_never_set_is_refused() {
    assert_eq!(parse_cclk(r#"+CCLK: "70/01/01,00:00:12+00""#), None);
    assert_eq!(parse_cclk(r#"+CCLK: "80/01/06,00:01:40+00""#), None);
}

#[test]
fn cclk_malformed_is_refused() {
    for line in [
        "+CCLK: 26/11/05,12:30:00+04",
        r#"+CCLK: "26/11/05 12:30:00+04""#,
        r#"+CCLK: "26/13/05,12:30:00+04""#,
        r#"+CCLK: "26/11/05,12:30:00+99""#,
        r#"+CCLK: "26/11/05,1:30:00+04""#,
        r#"+CGNSSINFO: "26/11/05,12:30:00+04""#,
    ] {
        assert_eq!(parse_cclk(line), None, "{line}");
    }
}

#[test]
fn http_action_status() {
    let action = parse_http_action("+HTTPACTION: 1,202,18").unwrap();
    assert_eq!(
        action,
        HttpAction {
            method: 1,
            status: 202,
            length: 18
        }
    );
    assert!(action.reached_server());
    let tls = parse_http_action("+HTTPACTION: 1,715,0").unwrap();
    assert!(!tls.reached_server());
    assert_eq!(parse_http_action("+HTTPACTION: 1,202"), None);
    assert_eq!(parse_http_action("+HTTPACTION: 1,202,18,9"), None);
}
