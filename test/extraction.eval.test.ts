import path from "path"
import { expect, it } from "vitest"

import { extractVaccines } from "../lib/extraction/extract-vaccines"

// Makes a real Claude API call.
it("extracts Leptospirosis from the Banfield visit", async () => {
  const raw = await extractVaccines(
    path.join("test-data", "2026-07-17_Banfield_Leptospirosis_I.pdf")
  )

  // The model wraps its JSON in a ```json code fence.
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")

  expect(JSON.parse(json)).toEqual([
    { vaccine_name: "Leptospirosis", date_given: "2026-07-17" },
  ])
}, 120_000)
