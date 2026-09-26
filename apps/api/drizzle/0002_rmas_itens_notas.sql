CREATE TABLE "rma_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issuer_name" text NOT NULL,
	"issuer_document" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rma_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"model" text NOT NULL,
	"serial_number" text NOT NULL,
	"reported_failure" text NOT NULL,
	"notes" text,
	"warranty_requested" boolean DEFAULT false NOT NULL,
	"warranty" text DEFAULT 'nao_solicitada' NOT NULL,
	"stage" text DEFAULT 'aguardando_envio' NOT NULL,
	"received_at" timestamp with time zone,
	"technical_report" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rma_items_stage_valid" CHECK ("rma_items"."stage" in ('aguardando_envio', 'em_transporte', 'recebido', 'em_diagnostico', 'aguardando_peca', 'aguardando_cliente', 'em_manutencao', 'em_testes', 'pronto_para_devolucao', 'em_devolucao', 'entregue')),
	CONSTRAINT "rma_items_warranty_valid" CHECK ("rma_items"."warranty" in ('nao_solicitada', 'em_analise', 'coberta', 'nao_coberta')),
	CONSTRAINT "rma_items_received_before_stage" CHECK ("rma_items"."stage" in ('aguardando_envio', 'em_transporte') or "rma_items"."received_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "rmas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "rmas_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 100001 CACHE 1),
	"customer_id" uuid NOT NULL,
	"requester_contact_id" uuid,
	"opened_by_account_id" uuid,
	"assignee_account_id" uuid,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "rmas_priority_valid" CHECK ("rmas"."priority" in ('normal', 'alta', 'urgente'))
);
--> statement-breakpoint
ALTER TABLE "rma_invoices" ADD CONSTRAINT "rma_invoices_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_requester_contact_id_customer_contacts_id_fk" FOREIGN KEY ("requester_contact_id") REFERENCES "public"."customer_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_opened_by_account_id_accounts_id_fk" FOREIGN KEY ("opened_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_assignee_account_id_accounts_id_fk" FOREIGN KEY ("assignee_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rma_invoices_rma_idx" ON "rma_invoices" USING btree ("rma_id");--> statement-breakpoint
CREATE INDEX "rma_invoices_number_idx" ON "rma_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "rma_items_position_key" ON "rma_items" USING btree ("rma_id","position");--> statement-breakpoint
CREATE INDEX "rma_items_serial_idx" ON "rma_items" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "rma_items_stage_idx" ON "rma_items" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "rmas_number_key" ON "rmas" USING btree ("number");--> statement-breakpoint
CREATE INDEX "rmas_customer_idx" ON "rmas" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "rmas_assignee_idx" ON "rmas" USING btree ("assignee_account_id");--> statement-breakpoint
CREATE INDEX "rmas_updated_idx" ON "rmas" USING btree ("updated_at");