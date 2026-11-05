# Trust anchors

`guardian-ca.pem` holds the root CAs the modem trusts for HTTPS to the
backend. It is uploaded to the A7670 file system as `guardian_ca_v1.pem`
(`src/modem/tls.rs`). Public certificates, copied from the macOS system
store; each block carries its SHA-256 fingerprint.

| Root | Why |
|---|---|
| ISRG Root X1 | Let's Encrypt. On 2026-11-05 Cloudflare served `aggc.dev` from YE1 → Root YE → ISRG Root X2, cross-signed by X1 |
| GTS Root R1, R4 | Google Trust Services, the other CA Cloudflare Universal SSL issues from |

Cloudflare can switch CAs on renewal; if HTTPS starts failing with a TLS
error (`+HTTPACTION: 1,7xx`), check the served chain:

```bash
echo | openssl s_client -connect gtapi.aggc.dev:443 -servername gtapi.aggc.dev -showcerts
echo | openssl s_client -connect gtapi.aggc.dev:443 -servername gtapi.aggc.dev -CAfile certs/guardian-ca.pem | grep "Verify return code"
```

Any change to the bundle must bump the file name (`guardian_ca_v2.pem`, both
constants in `tls.rs`), so the modem never keeps trusting an old copy.
