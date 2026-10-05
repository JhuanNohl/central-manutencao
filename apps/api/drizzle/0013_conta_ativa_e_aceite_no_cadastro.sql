ALTER TABLE "accounts" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_terms_acceptance_consistent" CHECK (("accounts"."terms_version" is null) = ("accounts"."terms_accepted_at" is null));