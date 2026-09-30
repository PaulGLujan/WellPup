import type { S3Event } from "aws-lambda"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// S3, Secrets Manager, and the Claude call are all faked, so these tests run
// without AWS credentials or API calls. The real parsing and Zod schema run.

const { s3Send, secretsSend, extract } = vi.hoisted(() => ({
  s3Send: vi.fn(),
  secretsSend: vi.fn(),
  extract: vi.fn(),
}))

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = s3Send
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = secretsSend
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}))

vi.mock("../../lib/extraction/extract-vaccines", () => ({
  extractVaccinesFromBuffer: extract,
}))

function s3Event(key: string): S3Event {
  return {
    Records: [{ s3: { bucket: { name: "uploads" }, object: { key } } }],
  } as unknown as S3Event
}

const fileBytes = new Uint8Array([37, 80, 68, 70]) // "%PDF"

// The handler caches the API key per module load (one Lambda cold start), so
// each test imports a fresh copy.
async function loadHandler() {
  vi.resetModules()
  return (await import("./extract-handler")).handler
}

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key")
  s3Send.mockResolvedValue({
    Body: { transformToByteArray: async () => fileBytes },
  })
  log = vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe("handler", () => {
  it("reads the upload from S3, extracts, and logs the validated result", async () => {
    extract.mockResolvedValue(
      '[{"vaccine_name":"IMRAB3","date_given":"2025-12-15"}]'
    )
    const handler = await loadHandler()

    await handler(s3Event("records/rabies.pdf"))

    expect(s3Send.mock.calls[0][0].input).toEqual({
      Bucket: "uploads",
      Key: "records/rabies.pdf",
    })
    expect(extract).toHaveBeenCalledWith(
      Buffer.from(fileBytes),
      "application/pdf"
    )
    expect(log).toHaveBeenCalledWith(
      "Extraction succeeded",
      JSON.stringify({
        bucket: "uploads",
        key: "records/rabies.pdf",
        vaccines: [{ name: "IMRAB3", dateGiven: "2025-12-15", dateDue: null }],
      })
    )
  })

  it("decodes the URL-encoded key from the S3 event", async () => {
    extract.mockResolvedValue("[]")
    const handler = await loadHandler()

    // S3 sends "Della's Record.pdf" as "Della%27s+Record.pdf".
    await handler(s3Event("Della%27s+Record.pdf"))

    expect(s3Send.mock.calls[0][0].input.Key).toBe("Della's Record.pdf")
  })

  it("logs the raw reply instead of throwing when the schema rejects it", async () => {
    const rawResponse = '[{"vaccine_name":"Rabies","date_given":"12/15/2025"}]'
    extract.mockResolvedValue(rawResponse)
    const handler = await loadHandler()

    await expect(handler(s3Event("rabies.pdf"))).resolves.toBeUndefined()

    const [message, details] = log.mock.calls[0]
    expect(message).toMatch(/^Validation failed/)
    expect(JSON.parse(details as string).rawResponse).toBe(rawResponse)
  })

  it("logs the raw reply instead of throwing when it isn't JSON", async () => {
    const rawResponse = "I couldn't read this document."
    extract.mockResolvedValue(rawResponse)
    const handler = await loadHandler()

    await expect(handler(s3Event("rabies.pdf"))).resolves.toBeUndefined()

    const [message, details] = log.mock.calls[0]
    expect(message).toMatch(/^Validation failed/)
    expect(JSON.parse(details as string).rawResponse).toBe(rawResponse)
  })

  it("skips files it can't send to Claude", async () => {
    const handler = await loadHandler()

    await handler(s3Event("notes.txt"))

    expect(s3Send).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
    expect(log.mock.calls[0][0]).toMatch(/^Skipped/)
  })

  it("loads the API key from Secrets Manager once per cold start", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("ANTHROPIC_API_KEY_SECRET_ID", "well-pup/anthropic-api-key")
    secretsSend.mockResolvedValue({ SecretString: "sk-from-secrets-manager" })
    extract.mockResolvedValue("[]")
    const handler = await loadHandler()

    await handler(s3Event("a.pdf"))
    await handler(s3Event("b.pdf"))

    expect(secretsSend).toHaveBeenCalledTimes(1)
    expect(secretsSend.mock.calls[0][0].input).toEqual({
      SecretId: "well-pup/anthropic-api-key",
    })
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-from-secrets-manager")
  })

  it("tries Secrets Manager again after a failed fetch on the same instance", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    vi.stubEnv("ANTHROPIC_API_KEY_SECRET_ID", "well-pup/anthropic-api-key")
    secretsSend
      .mockRejectedValueOnce(new Error("Secrets Manager unavailable"))
      .mockResolvedValueOnce({ SecretString: "sk-from-secrets-manager" })
    extract.mockResolvedValue("[]")
    const handler = await loadHandler()

    // First upload: the fetch fails, so the invocation fails.
    await expect(handler(s3Event("a.pdf"))).rejects.toThrow(
      "Secrets Manager unavailable"
    )
    // Lambda's retry lands on the same warm instance and fetches again.
    await handler(s3Event("a.pdf"))

    expect(secretsSend).toHaveBeenCalledTimes(2)
    expect(extract).toHaveBeenCalledTimes(1)
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-from-secrets-manager")
  })
})
