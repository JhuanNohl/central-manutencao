CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_at" timestamp with time zone,
	CONSTRAINT "files_purpose_valid" CHECK ("files"."purpose" in ('foto_item', 'nota_xml', 'declaracao')),
	CONSTRAINT "files_content_type_valid" CHECK ("files"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/xml')),
	CONSTRAINT "files_size_positive" CHECK ("files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "rma_receipt_items" (
	"receipt_id" uuid NOT NULL,
	"item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rma_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"received_by_account_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rma_shipment_items" (
	"shipment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rma_shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"method" text NOT NULL,
	"carrier" text,
	"tracking_code" text,
	"confirmed_by_account_id" uuid,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rma_shipments_method_valid" CHECK ("rma_shipments"."method" in ('transportadora', 'correios', 'entrega_propria'))
);
--> statement-breakpoint
CREATE TABLE "rma_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"validation_status" text,
	"rules_version" text,
	"issues" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rma_documents_kind_valid" CHECK ("rma_documents"."kind" in ('nota_xml', 'declaracao')),
	CONSTRAINT "rma_documents_xml_validated" CHECK ("rma_documents"."kind" <> 'nota_xml' or ("rma_documents"."validation_status" is not null and "rma_documents"."rules_version" is not null))
);
--> statement-breakpoint
CREATE TABLE "rma_item_photos" (
	"item_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_template_valid";--> statement-breakpoint
ALTER TABLE "rma_invoices" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "rma_items" ADD COLUMN "sla_hours" integer;--> statement-breakpoint
ALTER TABLE "rmas" ADD COLUMN "opening_key" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_receipt_items" ADD CONSTRAINT "rma_receipt_items_receipt_id_rma_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."rma_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_receipt_items" ADD CONSTRAINT "rma_receipt_items_item_id_rma_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rma_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_receipts" ADD CONSTRAINT "rma_receipts_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_receipts" ADD CONSTRAINT "rma_receipts_received_by_account_id_accounts_id_fk" FOREIGN KEY ("received_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_shipment_items" ADD CONSTRAINT "rma_shipment_items_shipment_id_rma_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."rma_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_shipment_items" ADD CONSTRAINT "rma_shipment_items_item_id_rma_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rma_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_shipments" ADD CONSTRAINT "rma_shipments_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_shipments" ADD CONSTRAINT "rma_shipments_confirmed_by_account_id_accounts_id_fk" FOREIGN KEY ("confirmed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_documents" ADD CONSTRAINT "rma_documents_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_documents" ADD CONSTRAINT "rma_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_item_photos" ADD CONSTRAINT "rma_item_photos_item_id_rma_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rma_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_item_photos" ADD CONSTRAINT "rma_item_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "files_temporary_idx" ON "files" USING btree ("created_at") WHERE "files"."linked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rma_receipt_items_item_key" ON "rma_receipt_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "rma_receipts_rma_idx" ON "rma_receipts" USING btree ("rma_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rma_shipment_items_item_key" ON "rma_shipment_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "rma_shipments_rma_idx" ON "rma_shipments" USING btree ("rma_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rma_documents_file_key" ON "rma_documents" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rma_documents_kind_key" ON "rma_documents" USING btree ("rma_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "rma_item_photos_file_key" ON "rma_item_photos" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rma_item_photos_position_key" ON "rma_item_photos" USING btree ("item_id","position");--> statement-breakpoint
ALTER TABLE "rma_invoices" ADD CONSTRAINT "rma_invoices_document_id_rma_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rma_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rmas_opening_key" ON "rmas" USING btree ("opened_by_account_id","opening_key");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_valid" CHECK ("notifications"."template" in ('convite', 'redefinicao_senha', 'confirmacao_email', 'rma_aberto', 'rma_itens_recebidos'));