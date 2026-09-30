import { z } from "zod"

// Pulls the JSON out of the model's reply. The model sometimes explains its
// reasoning before the JSON, so use the ```json code fence wherever it
// appears, or failing that, everything from the first "[" to the last "]".
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]

  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  return start !== -1 && end > start ? text.slice(start, end + 1) : text
}

// Parses the model's reply as JSON without checking its shape; validate the
// result with vaccineListSchema. If no valid JSON can be found, the error
// includes the full reply so it's clear what the model returned.
export function parseResponse(raw: string): unknown {
  try {
    return JSON.parse(extractJson(raw))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Response is not valid JSON (${reason}). Full reply:\n${raw}`
    )
  }
}

// One vaccine as the model returns it, in the snake_case keys the prompt asks
// for. The prompt doesn't ask for a due date yet, so date_due is usually
// missing; it's accepted here so the prompt can add it later.
const rawVaccineSchema = z.strictObject({
  vaccine_name: z.string().trim().min(1),
  date_given: z.iso.date(),
  date_due: z.iso.date().nullish(),
})

// Validates the model's parsed reply and converts it to the app's camelCase
// shape. dateDue is null until the prompt asks for a due date.
export const vaccineListSchema = z.array(
  rawVaccineSchema.transform((vaccine) => ({
    name: vaccine.vaccine_name,
    dateGiven: vaccine.date_given,
    dateDue: vaccine.date_due ?? null,
  }))
)

export type ExtractedVaccine = z.output<typeof vaccineListSchema>[number]
