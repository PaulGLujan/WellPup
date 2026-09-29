# Extraction pipeline

When a vet record is uploaded to the uploads bucket, S3 triggers a Lambda that
sends the file to Claude, validates the reply, and logs the result to
CloudWatch. This is the first slice of GH-15: there are no database writes,
presigned uploads, or status polling yet.

```
upload to S3 → S3 ObjectCreated event → Lambda (infra/lambda/extract-handler.ts)
  → read the file from S3 → Claude → parse + validate with Zod → log
```

The code it runs lives in `lib/extraction/`, shared with the eval suite:

- `extract-vaccines.ts`: `extractVaccinesFromBuffer` sends the file and the
  prompt to Claude and returns the raw reply.
- `parse-response.ts`: `parseResponse` pulls the JSON out of the reply, and
  `vaccineListSchema` validates it and converts it to
  `{ name, dateGiven, dateDue }`.

## How failures are handled

| Case | Example | What the handler does | Retried? |
|---|---|---|---|
| Unsupported file type | `notes.txt` | Logs `Skipped: unsupported file type` and returns | No |
| Reply isn't JSON | "I couldn't read this document." | Logs `Validation failed: reply is not valid JSON` with the raw reply and returns | No |
| Reply fails the schema | `"date_given": "12/15/2025"`, an extra key, a blank name | Logs `Validation failed: reply does not match the vaccine schema` with the Zod issues and the raw reply, and returns | No |
| Claude didn't reply | 429 rate limit, 5xx, timeout, connection error | Throws | Yes: by the Anthropic SDK, then by Lambda (see below) |
| S3 read fails | Object deleted or access denied | Throws | Yes: by Lambda |
| Secrets Manager fails | Secret missing or access denied | Throws | Yes: by Lambda |

### Why validation failures aren't retried

Claude answered, but the answer was wrong. Sending the same document with the
same prompt would likely give the same wrong answer, so a retry would only cost
another API call. The raw reply is logged instead, so it can be reviewed and,
if needed, the prompt fixed and checked with `pnpm test:eval`.

Replies are rejected rather than repaired. For example, the schema doesn't
convert `12/15/2025` to `2025-12-15`: a date like `03/04/2026` could be March 4
or April 3, and Claude, which sees the whole record, is in a better position to
decide than the code is.

### Why API errors are thrown

Rate limits, timeouts, and 5xx errors are usually temporary, so the same
request a little later will likely succeed. Throwing, rather than logging and
returning, lets Lambda retry the upload and marks the invocation as failed in
the Lambda's `Errors` metric, which is what a CloudWatch alarm would watch.

## Retries

Two layers retry, and both use their defaults:

| Layer | What it retries | How |
|---|---|---|
| Anthropic SDK, inside `client.messages.create()` | 429, 5xx, timeouts, and connection errors | 2 more requests, a few seconds apart, within one invocation |
| Lambda async invocation (S3 events are async) | Any invocation that throws | 2 more runs of the whole handler, about 1 and then 2 minutes later |

The SDK handles brief blips without leaving the invocation. Lambda's retries
cover what the SDK can't: a Claude outage longer than a few seconds, or a
temporary S3 or Secrets Manager error. In the worst case, a Claude outage
gets 3 runs × 3 requests = 9 attempts for one upload. If the last run also
throws, the event is dropped.

Validation failures aren't retried by either layer: the SDK only sees a
successful reply, and the handler returns normally, so Lambda doesn't see a
failure.

### Running more than once

A Lambda retry reruns the whole handler: it reads the file and calls Claude
again. S3 can also deliver the same event twice, even without a failure. That
is harmless while the handler only logs. Once it writes to the database, it
must be safe to run more than once for the same upload, for example by
skipping a job whose `extraction_jobs.status` is no longer `pending` and
incrementing `retry_count` on each run.

## The Anthropic API key

The key is stored in AWS Secrets Manager, not in the Lambda's configuration.
The Lambda gets only the secret's name, in `ANTHROPIC_API_KEY_SECRET_ID`, and
fetches the value once per cold start. Later invocations on the same warm
instance reuse it. A failed fetch isn't cached, so the next invocation on that
instance (for example, Lambda's retry) tries Secrets Manager again.

This is why `extract-vaccines.ts` creates its Anthropic client on first use
rather than at import: the client reads `ANTHROPIC_API_KEY` when it's created,
and at import time the Lambda hasn't loaded the key yet.

Locally, `ANTHROPIC_API_KEY` comes from `.env` and Secrets Manager isn't
called.

## Reading the logs

Each outcome is one log line: a message, then the details as JSON. Search the
Lambda's CloudWatch log group for:

- `Extraction succeeded`: `{ bucket, key, vaccines }`
- `Validation failed`: `{ bucket, key, issues or error, rawResponse }`
- `Skipped`: `{ bucket, key }`

Thrown errors appear as Lambda runtime errors with a stack trace.

## Testing

`pnpm test --run infra/lambda` runs the handler's unit tests. They fake S3,
Secrets Manager, and the Claude call, but use the real parsing and Zod schema,
so they need no AWS credentials or API key. See `docs/testing.md` for the
difference between unit and eval tests.
