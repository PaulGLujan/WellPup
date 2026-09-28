CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "appointments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pet_profile_id" integer NOT NULL,
	"date" date NOT NULL,
	"clinic" varchar(255),
	"vet_name" varchar(255),
	"notes" varchar
);
--> statement-breakpoint
CREATE TABLE "extraction_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "extraction_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pet_profile_id" integer NOT NULL,
	"s3_key" varchar(1024) NOT NULL,
	"status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"raw_response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pet_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"dob" date NOT NULL,
	"sex" "sex",
	"weight" numeric,
	"microchip" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vaccination_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vaccination_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vaccination_rule_id" integer NOT NULL,
	"appointment_id" integer,
	"pet_profile_id" integer NOT NULL,
	"completed_date" date
);
--> statement-breakpoint
CREATE TABLE "vaccination_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vaccination_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vaccine_name" varchar(255) NOT NULL,
	"age_trigger" interval,
	"recurrence" interval,
	CONSTRAINT "vaccination_rules_vaccine_name_unique" UNIQUE("vaccine_name")
);
--> statement-breakpoint
CREATE TABLE "vaccine_aliases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vaccine_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"raw_name" varchar(255) NOT NULL,
	"vaccination_rule_id" integer NOT NULL,
	CONSTRAINT "vaccine_aliases_raw_name_unique" UNIQUE("raw_name")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pet_profile_id_pet_profiles_id_fk" FOREIGN KEY ("pet_profile_id") REFERENCES "public"."pet_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_pet_profile_id_pet_profiles_id_fk" FOREIGN KEY ("pet_profile_id") REFERENCES "public"."pet_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_profiles" ADD CONSTRAINT "pet_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_vaccination_rule_id_vaccination_rules_id_fk" FOREIGN KEY ("vaccination_rule_id") REFERENCES "public"."vaccination_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_pet_profile_id_pet_profiles_id_fk" FOREIGN KEY ("pet_profile_id") REFERENCES "public"."pet_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccine_aliases" ADD CONSTRAINT "vaccine_aliases_vaccination_rule_id_vaccination_rules_id_fk" FOREIGN KEY ("vaccination_rule_id") REFERENCES "public"."vaccination_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_pet_profile_id_idx" ON "appointments" USING btree ("pet_profile_id");--> statement-breakpoint
CREATE INDEX "extraction_jobs_pet_profile_id_idx" ON "extraction_jobs" USING btree ("pet_profile_id");--> statement-breakpoint
CREATE INDEX "pet_profiles_user_id_idx" ON "pet_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vaccination_records_pet_profile_id_idx" ON "vaccination_records" USING btree ("pet_profile_id");--> statement-breakpoint
CREATE INDEX "vaccination_records_vaccination_rule_id_idx" ON "vaccination_records" USING btree ("vaccination_rule_id");--> statement-breakpoint
CREATE INDEX "vaccination_records_appointment_id_idx" ON "vaccination_records" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "vaccine_aliases_vaccination_rule_id_idx" ON "vaccine_aliases" USING btree ("vaccination_rule_id");