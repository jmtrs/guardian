//! Exact-byte signing adapter tests.

use guardian_core::error::Result;
use guardian_core::ports::{DeviceRequest, Uplink};
use guardian_device::ports::EventUplink;
use guardian_device::uplink::{SignedEventUplink, EVENTS_PATH};
use guardian_protocol::identity::{Context, DeviceId, RootSecret};
use guardian_protocol::time::UtcTime;

#[derive(Default)]
struct Transport {
    path: String,
    device_id: String,
    signature: String,
    body: Vec<u8>,
}

impl Uplink for Transport {
    fn network_time(&mut self) -> Result<UtcTime> {
        unreachable!()
    }

    fn post(&mut self, request: &DeviceRequest<'_>) -> Result<u16> {
        request.path.clone_into(&mut self.path);
        request.device_id.clone_into(&mut self.device_id);
        request.signature.clone_into(&mut self.signature);
        self.body = request.body.to_vec();
        Ok(202)
    }
}

#[test]
fn signs_and_sends_the_supplied_bytes_without_reserialising() {
    let device = DeviceId::new("uplink-test").unwrap();
    let root =
        RootSecret::from_hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
            .unwrap();
    let body = br#"{"sequence":7,"deliberately":"not-an-envelope"}"#;
    let expected = root.derive(&device, Context::Event).sign(body).hex();
    let mut uplink = SignedEventUplink::new(Transport::default(), device, &root);

    assert_eq!(uplink.post_event(body), Ok(202));
    let transport = uplink.into_inner();
    assert_eq!(transport.path, EVENTS_PATH);
    assert_eq!(transport.device_id, "uplink-test");
    assert_eq!(transport.signature, expected.as_str());
    assert_eq!(transport.body, body);
}
