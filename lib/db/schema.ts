// Source of truth for the database schema. Mirrors docs/schema.dbml.
import {
  date,
  index,
  integer,
  interval,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

export const sexEnum = pgEnum("sex", ["male", "female"])

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "processed",
  "failed",
])

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({ length: 255 }).notNull().unique(),
  name: varchar({ length: 255 }),
})

export const petProfiles = pgTable(
  "pet_profiles",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar({ length: 255 }).notNull(),
    dob: date().notNull(),
    sex: sexEnum(),
    weight: numeric(),
    microchip: varchar({ length: 255 }),
  },
  (t) => [index("pet_profiles_user_id_idx").on(t.userId)]
)

export const vaccinationRules = pgTable("vaccination_rules", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  vaccineName: varchar("vaccine_name", { length: 255 }).notNull().unique(),
  ageTrigger: interval("age_trigger"),
  recurrence: interval(),
})

// Maps raw names found in vet records to a canonical rule. raw_name is unique
// so a given alias always resolves to exactly one rule.
export const vaccineAliases = pgTable(
  "vaccine_aliases",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    rawName: varchar("raw_name", { length: 255 }).notNull().unique(),
    vaccinationRuleId: integer("vaccination_rule_id")
      .notNull()
      .references(() => vaccinationRules.id),
  },
  (t) => [
    index("vaccine_aliases_vaccination_rule_id_idx").on(t.vaccinationRuleId),
  ]
)

export const appointments = pgTable(
  "appointments",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    petProfileId: integer("pet_profile_id")
      .notNull()
      .references(() => petProfiles.id),
    date: date().notNull(),
    clinic: varchar({ length: 255 }),
    vetName: varchar("vet_name", { length: 255 }),
    notes: varchar(),
  },
  (t) => [index("appointments_pet_profile_id_idx").on(t.petProfileId)]
)

// Due date and status are derived from vaccination_rules at query time and are
// intentionally not stored here. Multiple records per pet per rule are allowed.
export const vaccinationRecords = pgTable(
  "vaccination_records",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    vaccinationRuleId: integer("vaccination_rule_id")
      .notNull()
      .references(() => vaccinationRules.id),
    appointmentId: integer("appointment_id").references(() => appointments.id),
    petProfileId: integer("pet_profile_id")
      .notNull()
      .references(() => petProfiles.id),
    completedDate: date("completed_date"),
  },
  (t) => [
    index("vaccination_records_pet_profile_id_idx").on(t.petProfileId),
    index("vaccination_records_vaccination_rule_id_idx").on(
      t.vaccinationRuleId
    ),
    index("vaccination_records_appointment_id_idx").on(t.appointmentId),
  ]
)

export const extractionJobs = pgTable(
  "extraction_jobs",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    petProfileId: integer("pet_profile_id")
      .notNull()
      .references(() => petProfiles.id),
    s3Key: varchar("s3_key", { length: 1024 }).notNull(),
    status: extractionStatusEnum().notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    rawResponse: text("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("extraction_jobs_pet_profile_id_idx").on(t.petProfileId)]
)
