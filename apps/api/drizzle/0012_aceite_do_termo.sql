ALTER TABLE "rmas" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "rmas" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_terms_acceptance_consistent" CHECK (("rmas"."terms_version" is null) = ("rmas"."terms_accepted_at" is null));