import { describe, expect, it } from "vitest"

import { parseResponse, vaccineListSchema } from "./parse-response"

// Replies written by hand to cover the shapes the model has returned. No API
// calls; the real model is exercised by the eval suite.

describe("parseResponse", () => {
  it("reads JSON inside a ```json code fence", () => {
    const raw =
      'Here are the vaccines:\n```json\n[{"vaccine_name":"IMRAB3","date_given":"2025-12-15"}]\n```'
    expect(parseResponse(raw)).toEqual([
      { vaccine_name: "IMRAB3", date_given: "2025-12-15" },
    ])
  })

  it("reads an unfenced array after explanatory text", () => {
    const raw =
      'The record lists one vaccine. [{"vaccine_name":"Leptospirosis","date_given":"2026-07-17"}]'
    expect(parseResponse(raw)).toEqual([
      { vaccine_name: "Leptospirosis", date_given: "2026-07-17" },
    ])
  })

  it("reads an empty array", () => {
    expect(parseResponse("[]")).toEqual([])
  })

  it("throws with the full reply when there is no JSON", () => {
    const raw = "I could not find any vaccines in this document."
    expect(() => parseResponse(raw)).toThrow(
      /not valid JSON[\s\S]*could not find/
    )
  })
})

describe("vaccineListSchema", () => {
  // The model replies in the snake_case keys the prompt asks for; the rest of
  // the app uses camelCase. These tests pin down that mapping:
  //   vaccine_name -> name, date_given -> dateGiven, date_due -> dateDue
  it("renames the model's snake_case keys to the app's camelCase keys", () => {
    const modelReply = [
      {
        vaccine_name: "IMRAB3",
        date_given: "2025-12-15",
        date_due: "2026-12-15",
      },
    ]

    const [vaccine] = vaccineListSchema.parse(modelReply)

    expect(vaccine).toEqual({
      name: "IMRAB3",
      dateGiven: "2025-12-15",
      dateDue: "2026-12-15",
    })
    // None of the model's original keys are passed through.
    expect(vaccine).not.toHaveProperty("vaccine_name")
    expect(vaccine).not.toHaveProperty("date_given")
    expect(vaccine).not.toHaveProperty("date_due")
  })

  it("sets dateDue to null when the model omits date_due", () => {
    // Today's prompt never asks for a due date, so this is the usual case.
    const modelReply = [{ vaccine_name: "DHPP-BORD", date_given: "2025-12-10" }]

    const [vaccine] = vaccineListSchema.parse(modelReply)

    expect(vaccine.dateDue).toBeNull()
  })

  it("accepts an empty list", () => {
    expect(vaccineListSchema.parse([])).toEqual([])
  })

  // Vet records write dates like "12/15/2025", but converting them is the
  // model's job: the prompt asks for YYYY-MM-DD, and the model can use the
  // whole record to tell 03/04 (March 4) from 03/04 (April 3). A slash date in
  // the reply means the model ignored the prompt, so the schema rejects it
  // rather than guessing, and the reply is kept for review (GH-15).
  it("rejects a date not in YYYY-MM-DD format", () => {
    const result = vaccineListSchema.safeParse([
      { vaccine_name: "Rabies", date_given: "12/15/2025" },
    ])
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual([0, "date_given"])
  })

  it("rejects keys the prompt didn't ask for", () => {
    const result = vaccineListSchema.safeParse([
      { vaccine_name: "Rabies", date_given: "2025-12-15", lot: "12695" },
    ])
    expect(result.success).toBe(false)
  })

  it("rejects a blank vaccine name", () => {
    const result = vaccineListSchema.safeParse([
      { vaccine_name: "  ", date_given: "2025-12-15" },
    ])
    expect(result.success).toBe(false)
  })

  it("rejects a reply that isn't a list", () => {
    const result = vaccineListSchema.safeParse({
      vaccine_name: "Rabies",
      date_given: "2025-12-15",
    })
    expect(result.success).toBe(false)
  })
})
