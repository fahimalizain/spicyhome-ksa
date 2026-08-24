
# ZatcaDocumentsOverallDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **submitted** | **kotlin.Int** | Current documents with status reported (simplified) or cleared (standard) |  |
| **queued** | **kotlin.Int** | Current documents with status signed (awaiting report) or pending (in clearance) |  |
| **failed** | **kotlin.Int** | Current documents with status failed (reporting) or error (retryable clearance) |  |
| **rejected** | **kotlin.Int** | Current documents with status rejected (must reissue with a new ICV) |  |
| **total** | **kotlin.Int** | Current documents (latest attempt per order / refund; prefers cleared) |  |
| **health** | [**inline**](#Health) | ok when failed + rejected is 0; queued alone stays ok |  |


<a id="Health"></a>
## Enum: health
| Name | Value |
| ---- | ----- |
| health | ok, attention |



