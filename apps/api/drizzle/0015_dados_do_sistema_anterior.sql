CREATE TABLE "customer_notes" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"updated_by_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rma_internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"author_account_id" uuid,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_records" (
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_records_source_table_source_id_pk" PRIMARY KEY("source_table","source_id"),
	CONSTRAINT "legacy_records_entity_type_valid" CHECK ("legacy_records"."entity_type" in ('account', 'customer', 'customer_contact', 'rma', 'rma_item', 'rma_message', 'rma_internal_note', 'rma_shipment', 'file'))
);
--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_updated_by_account_id_accounts_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_internal_notes" ADD CONSTRAINT "rma_internal_notes_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_internal_notes" ADD CONSTRAINT "rma_internal_notes_author_account_id_accounts_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rma_internal_notes_rma_idx" ON "rma_internal_notes" USING btree ("rma_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_records_entity_key" ON "legacy_records" USING btree ("source_table","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "legacy_records_entity_idx" ON "legacy_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "legacy_records_reference_idx" ON "legacy_records" USING btree ("reference");