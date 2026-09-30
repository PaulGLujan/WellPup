import path from "path"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager"
import type { S3Event } from "aws-lambda"

import {
  extractVaccinesFromBuffer,
  type MediaType,
} from "../../lib/extraction/extract-vaccines"
import {
  parseResponse,
  vaccineListSchema,
} from "../../lib/extraction/parse-response"

// Runs when a vet record lands in the uploads bucket: reads the file, sends it
// to Claude, validates the reply, and logs the result to CloudWatch. It does
// not write to the database yet (see GH-15 for the full pipeline).
//
// How each failure is handled:
//
// - Unsupported file type: logged as "Skipped" and returned. Nothing to retry.
//
// - Claude replied, but the reply isn't JSON or fails vaccineListSchema:
//   logged as "Validation failed" with the raw reply, and returned normally.
//   Sending the same document with the same prompt would likely fail the same
//   way, so this isn't retried; the raw reply is kept for review instead.
//
// - Claude didn't reply (rate limit, 5xx, timeout, connection error): the
//   Anthropic SDK retries these twice on its own. If they all fail, the error
//   is thrown, not caught. These are usually temporary, and throwing marks the
//   invocation as failed in the Lambda Errors metric.
//
// - S3 read or Secrets Manager failure: also thrown.
//
// When the handler throws, Lambda reruns the whole invocation up to twice more,
// about 1 and then 2 minutes later (the default for S3-triggered Lambdas). This
// covers failures the SDK's retries don't, like a longer outage or an S3
// error. S3 can also deliver the same event twice, so once the handler writes
// to the database it must be safe to run more than once for the same upload.

const s3 = new S3Client({})
const secretsManager = new SecretsManagerClient({})

// Media type by file extension. Uploads with any other extension are skipped.
const mediaTypes: Record<string, MediaType> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

// Loads the Anthropic key from Secrets Manager into ANTHROPIC_API_KEY, where
// the Anthropic client looks for it. The secret is fetched once per cold start
// and reused while the Lambda stays warm. If ANTHROPIC_API_KEY is already set
// (for example, when running locally), Secrets Manager isn't called.
//
// A failed fetch isn't cached: a rejected Promise isn't null, so ??= would
// otherwise keep returning it, and every later upload on this warm instance,
// including Lambda's retries, would fail without trying Secrets Manager again.
let apiKeyLoaded: Promise<void> | undefined

function loadApiKey(): Promise<void> {
  apiKeyLoaded ??= (async () => {
    if (process.env.ANTHROPIC_API_KEY) return

    const secretId = process.env.ANTHROPIC_API_KEY_SECRET_ID
    if (!secretId) {
      throw new Error("ANTHROPIC_API_KEY_SECRET_ID is not set")
    }
    const secret = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretId })
    )
    if (!secret.SecretString) {
      throw new Error(`Secret ${secretId} has no string value`)
    }
    process.env.ANTHROPIC_API_KEY = secret.SecretString
  })().catch((error) => {
    apiKeyLoaded = undefined
    throw error
  })
  return apiKeyLoaded
}

export async function handler(event: S3Event): Promise<void> {
  await loadApiKey()

  // One event can carry several uploads; handle them one at a time.
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name
    // S3 URL-encodes keys in events and writes spaces as "+".
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "))
    await extractRecord(bucket, key)
  }
}

async function extractRecord(bucket: string, key: string): Promise<void> {
  const mediaType = mediaTypes[path.extname(key).toLowerCase()]
  if (!mediaType) {
    console.log(
      "Skipped: unsupported file type",
      JSON.stringify({ bucket, key })
    )
    return
  }

  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  )
  if (!object.Body) throw new Error(`s3://${bucket}/${key} has no body`)
  const data = Buffer.from(await object.Body.transformToByteArray())

  const rawResponse = await extractVaccinesFromBuffer(data, mediaType)

  // A reply that isn't valid JSON, or doesn't match the schema, is logged with
  // the full reply for review rather than thrown.
  let parsed: unknown
  try {
    parsed = parseResponse(rawResponse)
  } catch (error) {
    console.log(
      "Validation failed: reply is not valid JSON",
      JSON.stringify({ bucket, key, error: String(error), rawResponse })
    )
    return
  }

  const result = vaccineListSchema.safeParse(parsed)
  if (!result.success) {
    console.log(
      "Validation failed: reply does not match the vaccine schema",
      JSON.stringify({ bucket, key, issues: result.error.issues, rawResponse })
    )
    return
  }

  console.log(
    "Extraction succeeded",
    JSON.stringify({ bucket, key, vaccines: result.data })
  )
}
