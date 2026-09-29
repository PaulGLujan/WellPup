import path from "path"
import { expect, it } from "vitest"

import { extractVaccines } from "../lib/extraction/extract-vaccines"

// Each sample is a PDF in test-data/ and the exact JSON extraction should
// return for it. Add a sample by adding an entry here.
const samples = [
  {
    file: "2026-07-17_Banfield_Leptospirosis_I.pdf",
    expected: [{ vaccine_name: "Leptospirosis", date_given: "2026-07-17" }],
  },
  {
    // Puppy exam with nothing on file: no vaccines.
    file: "2025-12-19_Banfield_New_Puppy_Exam.pdf",
    expected: [],
  },
  {
    // Hallucination check: the exam lists bordetella only as a differential
    // diagnosis being ruled out ("CIRDC r/o mycoplasma, parainfluenza,
    // bordetella..."), not as a vaccine that was given. Reporting Bordetella
    // here would wrongly mark the dog's kennel cough vaccine as done.
    file: "2025-12-22_June_Kennel_Cough_Exam.pdf",
    expected: [],
  },
  {
    // Post-surgical release form: no vaccines.
    file: "2025-12-18_Post_Surgical_Release_Form.pdf",
    expected: [],
  },
  {
    // Adoption ad, not a vet record at all: no vaccines.
    file: "2025-12-8_Della_Adoption_Ad.pdf",
    expected: [],
  },
  {
    // Rabies certificate. The vaccine field says "IMRAB3" (a rabies brand)
    // under a "Rabies Vaccination Certificate" heading. It also lists an
    // expiry (12/15/2026), but the prompt doesn't ask for a due date yet.
    file: "2025-12-15_June_Sterility_And_Vaccination.pdf",
    expected: [{ vaccine_name: "IMRAB3", date_given: "2025-12-15" }],
  },
  {
    // Medical history, names as written. The 12/10 exam lists "DHPP-BORD", a
    // combination shot (DHPP + Bordetella); splitting it is left to alias
    // normalization (GH-19). The 12/15 surgery lists "DRABIES12695", a rabies
    // shot with its lot number attached: the same shot as the certificate.
    file: "2025-12-10_Dellas_Medical_History.pdf",
    expected: [
      { vaccine_name: "DHPP-BORD", date_given: "2025-12-10" },
      { vaccine_name: "DRABIES12695", date_given: "2025-12-15" },
    ],
  },
  {
    // OC Animal Care receipt: same shots as the medical history. Page 4's
    // treatment table lists "DHPP-BORD" (12/10) and "DRABIES12695" (12/15).
    // Page 6's rabies certificate records the same rabies dose by its brand,
    // "IMRAB3". When a dose has both a brand name and an inventory code, the
    // brand name wins, so rabies is expected once, as "IMRAB3".
    file: "2025-12-18_OC_Animal _Care_Receipt.pdf",
    expected: [
      { vaccine_name: "DHPP-BORD", date_given: "2025-12-10" },
      { vaccine_name: "IMRAB3", date_given: "2025-12-15" },
    ],
  },
]

// The model wraps its JSON in a ```json code fence.
function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
}

type Vaccine = { vaccine_name: string; date_given: string }

// Parses the model's reply. If it isn't valid JSON, the error includes the
// full reply so it's clear what the model added.
function parseResponse(raw: string): Vaccine[] {
  try {
    return JSON.parse(stripCodeFence(raw))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Response is not valid JSON (${reason}). Full reply:\n${raw}`
    )
  }
}

function sortVaccines(vaccines: Vaccine[]): Vaccine[] {
  return [...vaccines].sort(
    (a, b) =>
      a.vaccine_name.localeCompare(b.vaccine_name) ||
      a.date_given.localeCompare(b.date_given)
  )
}

// Makes one real Claude API call per sample.
it.each(samples)(
  "extracts the expected vaccines from $file",
  async ({ file, expected }) => {
    const raw = await extractVaccines(path.join("test-data", file))

    const actual = parseResponse(raw)

    // Order doesn't matter, so compare both lists sorted. A failure still
    // shows the full diff.
    expect(sortVaccines(actual)).toEqual(sortVaccines(expected))
  },
  120_000
)
