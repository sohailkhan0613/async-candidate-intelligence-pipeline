# API Collection (Postman)

Postman assets for the Async Candidate Intelligence Pipeline API.

## Files

| File | Description |
| ---- | ----------- |
| `async-candidate-intelligence-pipeline.postman_collection.json` | All API requests |
| `local.postman_environment.json` | Local `baseUrl` and variables |

## Import into Postman

1. Open Postman → **Import**
2. Select both JSON files in this folder
3. Choose the **Local Development** environment
4. Run **`npm run dev`** so the API is up on `http://localhost:3000`

## Suggested flow

1. **Submit Batch** — saves `batchId` and `correlationId` to collection variables
2. **Get Batch Status** — poll until `status` is `COMPLETED`
3. **Get Candidate Result** — view parsed/scored/recommendation output
4. **Stream Batch Events (SSE)** — optional live updates (curl often works better for SSE)
5. **Get Circuit Breaker State** — inspect breaker (`CLOSED` / `OPEN` / `HALF_OPEN`)

## Variables

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `baseUrl` | `http://localhost:3000` | Match `PORT` in `.env` |
| `tenantId` | `acme-corp` | Must exist in `tenants.config.json` |
| `candidateId` | `candidate-1` | Globally unique per assignment |
| `batchId` | _(auto)_ | Set by Submit Batch test script |
