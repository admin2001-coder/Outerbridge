| Area | Added / changed |
| --- | --- |
| Credential | `packages/components/credentials/TencentCloud/TencentCloudApi.ts` |
| Node | `packages/components/nodes/TencentCloud/TencentCloud.ts` |
| Icon | `packages/components/nodes/TencentCloud/tencentcloud.svg` |
| Docs | `docs/tencent-cloud-component.md` |
| Build hygiene | Removed duplicate `[NETWORK.HECO]` key in `packages/components/src/ChainNetwork.ts` |
| Build hygiene | Added `@types/node` to `packages/components/package.json` dev dependencies |

The Tencent Cloud node implements TC3-HMAC-SHA256 signing directly. Tencent's docs describe TC3-HMAC-SHA256 as the recommended Signature v3 method, with `content-type` and `host` as required signed headers and SHA-256 payload hashing. The node also emits Tencent common headers such as `X-TC-Action`, `X-TC-Timestamp`, `X-TC-Version`, optional `X-TC-Region`, and optional `X-TC-Token`.

Supported request modes:

| Mode | Status |
| --- | --- |
| POST JSON | Implemented |
| GET form-urlencoded | Implemented |
| POST form-urlencoded | Implemented |
| POST raw string | Implemented |
| POST multipart form-data | Implemented, including text fields and file fields |
| Temporary STS/CAM token | Implemented via optional credential token |
| Base64/binary response handling | Implemented |
| Fail on Tencent `Response.Error` | Implemented as configurable boolean |

I also included a usage guide in `docs/tencent-cloud-component.md`. Example input for CVM `DescribeInstances`:
```json
{\
  "endpoint": "cvm.tencentcloudapi.com",\
  "service": "cvm",\
  "action": "DescribeInstances",\
  "version": "2017-03-12",\
  "region": "ap-guangzhou",\
  "httpMethod": "POST",\
  "bodyMode": "json",\
  "parameters": {\
    "Limit": 1\
  }\
}
```

I validated the new Tencent Cloud node and credential with TypeScript transpilation and a targeted strict typecheck using local stubs. I could not run a full repository build with real dependencies in this environment because dependency installation did not complete here, so the final runtime test still needs to be done with real Tencent Cloud credentials and activated Tencent products. The downloaded project is complete with the code changes included.
