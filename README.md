
# Async Candidate Intelligence Pipeline

Production-grade asynchronous AI candidate processing pipeline built with TypeScript, Express, BullMQ, Redis, SQLite, OpenAI, and Zod.

---

# Overview

This service processes recruiter candidate batches asynchronously through a resumable 3-stage AI pipeline:

1. Resume Parsing
2. Candidate Scoring
3. Hiring Recommendation

The system is designed to handle:

* partial failures
* resumable execution
* OpenAI outages
* token/context limits
* real-time progress streaming
* persistent storage across restarts
* tenant-specific scoring logic

The API immediately returns after queueing jobs and all candidate processing happens in background workers.

---

# Tech Stack

| Technology               | Usage                                          |
| ------------------------ | ---------------------------------------------- |
| TypeScript (strict mode) | Type-safe backend implementation               |
| Express                  | HTTP API                                       |
| BullMQ                   | Distributed async job orchestration            |
| Redis                    | BullMQ backend + shared circuit breaker state  |
| SQLite + better-sqlite3  | Persistent pipeline storage                    |
| OpenAI SDK v4.x          | AI processing                                  |
| Zod                      | Runtime validation + inferred TypeScript types |
| Pino                     | Structured logging                             |
| Vitest                   | Unit + integration tests                       |

---

# OpenAI Model Choice

## Model Used

`gpt-4.1-mini`

## Why This Model

The pipeline primarily performs:

* structured extraction
* resume summarization
* scoring
* recommendation generation

These are deterministic structured tasks and do not require the reasoning depth of larger models.

`gpt-4.1-mini` was selected because it provides:

* significantly lower latency
* lower token cost
* reliable structured JSON outputs
* sufficient quality for extraction/scoring tasks

This is important because the system processes candidates asynchronously in batches and model latency directly affects throughput.

---

# Features

## Implemented Features

* Async batch submission
* 3-stage resumable BullMQ pipeline
* Redis-backed shared circuit breaker
* SQLite persistence
* Real-time SSE streaming
* Tenant-based scoring weights
* Resume chunking + summarization
* Structured JSON logging
* Typed errors everywhere
* Strict TypeScript mode
* Zod validation on all boundaries
* Retry handling per stage
* Correlation ID propagation
* Integration + unit tests

---

# Project Structure

```txt
src/
 ├── api/
 │    ├── controllers/
 │    ├── middleware/
 │    └── routes/
 │
 ├── workers/
 │    ├── resume-parser.worker.ts
 │    ├── candidate-scorer.worker.ts
 │    └── hiring-recommender.worker.ts
 │
 ├── queues/
 │    ├── redis.ts
 │    ├── resume-parser.queue.ts
 │    ├── candidate-scorer.queue.ts
 │    └── hiring-recommender.queue.ts
 │
 ├── services/
 │    ├── openai/
 │    ├── circuit-breaker/
 │    ├── tokenization/
 │    ├── tenants/
 │    ├── sse/
 │    └── logging/
 │
 ├── db/
 │    ├── sqlite.ts
 │    ├── schema.ts
 │    └── repositories/
 │
 ├── schemas/
 │    ├── api.schemas.ts
 │    ├── pipeline.schemas.ts
 │    ├── tenant.schemas.ts
 │    └── error.schemas.ts
 │
 ├── tests/
 └── app.ts
```

---

# Pipeline Architecture

## High-Level Flow

```txt
POST /api/v1/batches
        │
        ▼
Validate payload using Zod
        │
        ▼
Persist batch + candidates to SQLite
        │
        ▼
Enqueue Stage 1 BullMQ jobs
        │
        ▼
┌────────────────────────────┐
│ Resume Parser Worker       │
│ Queue: resume-parser       │
└────────────────────────────┘
        │
Persist ParsedResume
        │
Enqueue Stage 2
        │
        ▼
┌────────────────────────────┐
│ Candidate Scorer Worker    │
│ Queue: candidate-scorer    │
└────────────────────────────┘
        │
Persist ScoringResult
        │
Enqueue Stage 3
        │
        ▼
┌────────────────────────────┐
│ Hiring Recommender Worker  │
│ Queue: hiring-recommender  │
└────────────────────────────┘
        │
Persist Recommendation
        │
Emit SSE update
```

---

# Why Separate BullMQ Queues

Each pipeline stage is intentionally isolated.

This provides:

* independent retry policies
* resumable processing
* partial failure preservation
* easier observability
* easier debugging
* independent scaling in future

Example:

* If Stage 2 fails after Stage 1 succeeds:

  * Stage 1 output remains persisted in SQLite
  * Stage 1 does NOT rerun
  * only Stage 2 retries

This avoids duplicate OpenAI costs and preserves deterministic pipeline boundaries.

---

# SQLite Persistence Design

## Tables

### batches

Stores batch metadata.

```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  jd TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### candidates

Stores candidate pipeline state.

```sql
CREATE TABLE candidates (
  candidate_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT,
  raw_resume TEXT NOT NULL,
  parsed_resume_json TEXT,
  scoring_result_json TEXT,
  recommendation_json TEXT,
  error_json TEXT,
  updated_at TEXT NOT NULL
);
```

## Why JSON Columns

The pipeline outputs are complex nested structures already validated through Zod.

Storing stage outputs as JSON:

* simplifies persistence
* preserves schema evolution flexibility
* avoids unnecessary relational fragmentation
* makes stage restoration straightforward

---

# Context Window Management

## Problem

Large resumes may exceed model context limits.

The assignment specifically requires handling resumes larger than 3000 tokens.

## Token Counting

Token counting is implemented using a real tokenizer.

Library:

`tiktoken`

Character length is NOT used as a token approximation.

---

## Chunking Strategy

### Configuration

| Parameter  | Value       |
| ---------- | ----------- |
| Chunk Size | 2000 tokens |
| Overlap    | 250 tokens  |

## Why Overlap Exists

Overlap prevents loss of context at chunk boundaries.

Without overlap:

* bullet points
* sentence fragments
* company transitions
* role summaries

could be split incorrectly.

The overlap ensures semantic continuity between chunks.

---

## Resume Processing Strategy

### Under 3000 Tokens

Flow:

```txt
Raw Resume
   ↓
Direct Parsing
   ↓
ParsedResume
```

### Over 3000 Tokens

Flow:

```txt
Raw Resume
   ↓
Tokenize
   ↓
Chunk with overlap
   ↓
Summarize each chunk using LLM
   ↓
Merge summaries
   ↓
Generate ParsedResume
```

`wasTruncated` is set to `true` only if chunking/summarization occurred.

---

# Stage Responsibilities

# Stage 1 — Resume Parser

Queue:

`resume-parser`

Responsibilities:

* token counting
* chunking large resumes
* summarization
* extracting normalized structured data
* generating normalized resume text for Stage 2

Output:

`ParsedResume`

Retry Policy:

* 3 attempts
* exponential backoff starting at 2 seconds

---

# Stage 2 — Candidate Scorer

Queue:

`candidate-scorer`

Responsibilities:

* read ONLY Stage 1 output
* apply tenant scoring weights
* score candidate across dimensions
* produce evidence-grounded rationales

Important Design Constraint:

Stage 2 NEVER reads the raw resume.

It only consumes:

`ParsedResume.normalizedText`

This preserves:

* stage isolation
* resumability
* deterministic pipeline flow
* reduced token usage

Retry Policy:

* 2 attempts
* fixed 5 second delay

If retries fail:

* candidate marked FAILED at Stage 2
* Stage 1 output preserved

---

# Stage 3 — Hiring Recommendation

Queue:

`hiring-recommender`

Responsibilities:

* consume scoring result
* apply tenant threshold
* generate recruiter-friendly hiring recommendation

Output:

* STRONG_YES
* YES
* MAYBE
* NO

Retry Policy:

* single attempt only

If Stage 3 fails:

* Stage 1 and Stage 2 outputs remain persisted
* candidate marked FAILED at Stage 3

---

# Circuit Breaker Design

## Why a Circuit Breaker Exists

The OpenAI API is an external dependency.

Without a circuit breaker:

* repeated failures could overload workers
* queues could flood retries
* latency would increase significantly
* workers could repeatedly fail expensive calls

---

# State Machine

```txt
CLOSED
  │
  ├── 3 failures within 60 seconds
  ▼
OPEN
  │
  ├── after 30 seconds
  ▼
HALF_OPEN
  │
  ├── success → CLOSED
  └── failure → OPEN
```

---

# Redis-Backed Shared State

Circuit breaker state is stored in Redis instead of memory.

This ensures:

* state survives worker restarts
* multiple workers share the same breaker state
* failures in one worker affect all workers consistently

---

# Redis Keys

```txt
circuit:state
circuit:opened_at
circuit:failure_timestamps
circuit:half_open_probe
```

---

# Circuit Open Behaviour

When the breaker is OPEN:

* OpenAI is NOT called
* workers fail fast with `CIRCUIT_OPEN`
* jobs are requeued with delay until HALF_OPEN time
* jobs are NOT permanently failed

This prevents unnecessary API pressure during outages.

---

# SSE Architecture

Endpoint:

```txt
GET /api/v1/batches/:batchId/stream
```

## Behaviour

* connection remains open
* updates stream in real time
* heartbeat sent every 15 seconds
* closes automatically after batch completion

---

## Event Types

### Candidate Update

```txt
event: candidate-update
```

### Batch Complete

```txt
event: batch-complete
```

### Heartbeat

```txt
: heartbeat
```

---

# Structured Logging

Logging uses:

`pino`

All logs are structured JSON.

Example:

```json
{
  "level": "info",
  "timestamp": "2026-01-01T12:00:00Z",
  "correlationId": "uuid",
  "batchId": "batch-123",
  "candidateId": "candidate-1",
  "tenantId": "acme-corp",
  "stage": "STAGE_2",
  "event": "stage_completed",
  "durationMs": 2042,
  "message": "Candidate scoring completed"
}
```

---

# Correlation ID Propagation

A `correlationId` is generated at the initial HTTP request.

It propagates through:

```txt
HTTP Request
   ↓
BullMQ Job Payload
   ↓
Worker Execution
   ↓
Database Persistence
   ↓
Structured Logs
```

This enables tracing an entire batch lifecycle across asynchronous workers.

---

# Tenant Configuration

Configuration File:

```txt
tenants.config.json
```

Tenant config includes:

* scoring weights
* hiring threshold
* max candidates per batch

---

# Validation Strategy

Tenant config is validated during application startup.

Validation includes:

* required fields
* numeric ranges
* weights sum exactly to 1.0

If validation fails:

* server startup aborts immediately
* invalid configuration never reaches runtime

---

# Runtime Behaviour

Tenant config is loaded once during startup.

Changes to the JSON file while the app is running are NOT hot reloaded.

This was intentionally chosen to:

* simplify consistency guarantees
* avoid runtime config drift across workers
* keep worker behaviour deterministic

A restart is required after config changes.

---

# Typed Error Handling

All API errors use a single Zod schema.

## Error Shape

```json
{
  "error": "Human-readable description",
  "code": "VALIDATION_ERROR",
  "correlationId": "uuid",
  "details": {}
}
```

---

# Error Codes

Supported error codes:

* VALIDATION_ERROR
* AI_ERROR
* SCHEMA_VIOLATION
* CIRCUIT_OPEN
* UNKNOWN_TENANT
* BATCH_TOO_LARGE
* NOT_FOUND
* RATE_LIMIT

---

# Testing Strategy

## Test Coverage

Implemented tests:

1. Valid batch submission persists to SQLite
2. Unknown tenant rejection
3. Tenant batch size validation
4. Resume chunking for large resumes
5. Stage isolation verification
6. Circuit breaker state transitions

---

# Important Test Design

## Stage Isolation Test

The most important architecture test verifies:

* Stage 1 runs exactly once
* Stage 2 failure does NOT trigger Stage 1 rerun

This confirms:

* resumability
* persistence boundaries
* proper queue isolation

---

# Deployment Architecture

## Platform

Azure App Service

## Components

| Component   | Platform                   |
| ----------- | -------------------------- |
| Node.js API | Azure App Service          |
| Redis       | Azure Cache for Redis      |
| SQLite      | Persistent mounted storage |

---

# Deployment Notes

SQLite database file persists on mounted application storage.

Redis is externally provisioned and accessed through environment variables.

All secrets are configured through environment variables.

No credentials are committed to source control.

---

# Environment Variables

## Required Variables

```env
PORT=
NODE_ENV=
OPENAI_API_KEY=
OPENAI_MODEL=
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
DATABASE_PATH=
LOG_LEVEL=
```

---

# Local Development

## Prerequisites

* Node.js 22+
* Docker
* Redis

---

# Start Redis

```bash
docker compose up -d redis
```

---

# Install Dependencies

```bash
npm install
```

---

# Start Development Server

```bash
npm run dev
```

---

# Docker Compose

```yaml
services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

---

# API Endpoints

## Submit Batch

```http
POST /api/v1/batches
```

---

## Batch Status

```http
GET /api/v1/batches/:batchId
```

---

## Candidate Result

```http
GET /api/v1/candidates/:candidateId/result
```

---

## SSE Stream

```http
GET /api/v1/batches/:batchId/stream
```

---

## Circuit Breaker State

```http
GET /api/v1/system/circuit-breaker
```

---

# Assumptions

## Assumption 1

Candidate IDs are globally unique.

Reason:

* simplifies lookup APIs
* avoids composite identifiers
* keeps worker payloads smaller

---

## Assumption 2

SQLite is sufficient for assessment-scale workloads.

Reason:

* assignment explicitly requires SQLite
* concurrent write volume is relatively small
* simplifies deployment complexity

---

## Assumption 3

Worker and API process can run in same deployment unit.

Reason:

* simplifies deployment for assessment
* still preserves queue isolation through BullMQ

---

## Assumption 4

Resume text is already extracted from PDFs.

Reason:

* assignment provides raw resume text
* PDF parsing is outside scope

---

# One Explicit Cut

## Cut

Did not implement live token streaming from OpenAI responses into SSE.

## Reason

The assessment primarily evaluates:

* pipeline reliability
* resumability
* failure handling
* async orchestration

Streaming partial LLM tokens would increase implementation complexity significantly without improving core architecture correctness.

Instead, the implementation prioritizes:

* stage isolation
* persistence correctness
* retry safety
* observability

---

# Future Improvements

Potential future enhancements:

* dead letter queue consumer
* batch leaderboard endpoint
* rerun from arbitrary stage endpoint
* horizontal worker autoscaling
* Langfuse tracing
* PostgreSQL migration
* distributed SSE event bus
* prompt version registry

---

# AI Usage Disclosure

## Tools Used

* ChatGPT

## Approximate AI Usage

~20-25%

## AI-Assisted Areas

* small syntax/reference assistance
* architecture brainstorming
* README structure refinement
* edge case review

## Fully Self-Authored Areas

* overall system architecture
* queue orchestration design
* persistence strategy
* circuit breaker implementation approach
* retry handling strategy
* SSE architecture
* tenant configuration handling
* schema design
* testing approach
* failure handling decisions

---

# Final Notes

The primary goal of this implementation was reliability and correctness under asynchronous failure scenarios.

Special focus was placed on:

* stage isolation
* resumability
* typed boundaries
* persistence guarantees
* observability
* graceful degradation during external dependency failures

The system is intentionally backend-focused and optimized for operational clarity over unnecessary abstraction.
