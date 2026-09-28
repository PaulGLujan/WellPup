import { sql } from "drizzle-orm"

import { db } from "../lib/db"
import { normalizeAliasName } from "../lib/db/aliases"
import { users, vaccinationRules, vaccineAliases } from "../lib/db/schema"

// PLACEHOLDER INTERVALS: every ageTrigger/recurrence value below is a rough
// placeholder and must be verified against the current AAHA Canine
// Vaccination Guidelines before being relied on.
const rules: {
  vaccineName: string
  ageTrigger: string
  recurrence: string
  aliases: string[]
}[] = [
  {
    vaccineName: "DHPP",
    ageTrigger: "8 weeks", // placeholder, verify against AAHA
    recurrence: "3 years", // placeholder, verify against AAHA
    aliases: [
      "DAPP",
      "DA2PP",
      "DHLPP",
      "Distemper/Parvo",
      "Distemper combo",
      "5-in-1",
    ],
  },
  {
    vaccineName: "Rabies (1-year)",
    ageTrigger: "12 weeks", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: [
      "Rabies 1-year",
      "Rabies 1 year",
      "Rabies 1 yr",
      "Rabies 1yr",
      "RV 1yr",
    ],
  },
  {
    vaccineName: "Rabies (3-year)",
    ageTrigger: "16 months", // placeholder, verify against AAHA
    recurrence: "3 years", // placeholder, verify against AAHA
    // Generic rabies names map here, the more common booster interval.
    aliases: [
      "Rabies",
      "Rabies vaccine",
      "Rabies 3-year",
      "Rabies 3 year",
      "Rabies 3 yr",
      "Rabies 3yr",
      "RV 3yr",
    ],
  },
  {
    vaccineName: "Leptospirosis",
    ageTrigger: "12 weeks", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: ["Lepto", "Lepto 4", "L4", "Leptospira"],
  },
  {
    vaccineName: "Lyme (Borrelia)",
    ageTrigger: "12 weeks", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: ["Lyme", "Lyme disease", "Borrelia", "Borrelia burgdorferi"],
  },
  {
    vaccineName: "Bordetella",
    ageTrigger: "8 weeks", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: ["Kennel cough", "Bordetella bronchiseptica", "Bord", "CIRDC"],
  },
  {
    vaccineName: "Canine influenza",
    ageTrigger: "8 weeks", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: [
      "CIV",
      "Canine flu",
      "Dog flu",
      "H3N2/H3N8",
      "Bivalent influenza",
    ],
  },
  {
    vaccineName: "Heartworm test",
    ageTrigger: "7 months", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: [
      "Heartworm",
      "HW test",
      "4Dx",
      "SNAP 4Dx",
      "Heartworm antigen test",
    ],
  },
  {
    vaccineName: "Dental cleaning",
    ageTrigger: "1 year", // placeholder, verify against AAHA
    recurrence: "1 year", // placeholder, verify against AAHA
    aliases: [
      "Dental",
      "Dental prophylaxis",
      "Dental prophy",
      "COHAT",
      "Teeth cleaning",
    ],
  },
]

function redactSecrets(text: string): string {
  let redacted = text
  for (const envVar of ["DATABASE_URL", "DATABASE_URL_POOLED"]) {
    const value = process.env[envVar]
    if (value) {
      redacted = redacted.split(value).join("[redacted]")
    }
  }
  return redacted
}

async function main(): Promise<void> {
  await db
    .insert(users)
    .values({ name: "Demo User", email: "demo@example.com" })
    .onConflictDoNothing({ target: users.email })

  // Upsert so edits to the placeholder intervals above take effect on re-run.
  const insertedRules = await db
    .insert(vaccinationRules)
    .values(
      rules.map(({ vaccineName, ageTrigger, recurrence }) => ({
        vaccineName,
        ageTrigger,
        recurrence,
      }))
    )
    .onConflictDoUpdate({
      target: vaccinationRules.vaccineName,
      set: {
        ageTrigger: sql`excluded.age_trigger`,
        recurrence: sql`excluded.recurrence`,
      },
    })
    .returning({
      id: vaccinationRules.id,
      vaccineName: vaccinationRules.vaccineName,
    })

  const ruleIds = new Map(insertedRules.map((r) => [r.vaccineName, r.id]))

  const aliasRows = rules.flatMap(({ vaccineName, aliases }) =>
    aliases.map((rawName) => ({
      rawName: normalizeAliasName(rawName),
      vaccinationRuleId: ruleIds.get(vaccineName)!,
    }))
  )

  // Postgres rejects an upsert that touches the same row twice, so catch
  // aliases that collide after normalization before sending them.
  const seen = new Set<string>()
  for (const { rawName } of aliasRows) {
    if (seen.has(rawName)) {
      throw new Error(`Duplicate alias after normalization: "${rawName}"`)
    }
    seen.add(rawName)
  }

  // Upsert so an alias moved to a different rule above is re-pointed on re-run.
  await db
    .insert(vaccineAliases)
    .values(aliasRows)
    .onConflictDoUpdate({
      target: vaccineAliases.rawName,
      set: { vaccinationRuleId: sql`excluded.vaccination_rule_id` },
    })

  console.log(
    `Seeded 1 user, ${rules.length} vaccination rules, ${aliasRows.length} aliases.`
  )
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Seed failed: ${redactSecrets(message)}`)
  process.exit(1)
})
