CREATE TABLE "rma_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rma_id" uuid NOT NULL,
	"author_account_id" uuid NOT NULL,
	"author_side" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rma_messages_side_valid" CHECK ("rma_messages"."author_side" in ('cliente', 'equipe')),
	CONSTRAINT "rma_messages_body_length" CHECK (char_length("rma_messages"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_template_valid";--> statement-breakpoint
ALTER TABLE "rmas" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rmas" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "rma_messages" ADD CONSTRAINT "rma_messages_rma_id_rmas_id_fk" FOREIGN KEY ("rma_id") REFERENCES "public"."rmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_messages" ADD CONSTRAINT "rma_messages_author_account_id_accounts_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rma_messages_rma_idx" ON "rma_messages" USING btree ("rma_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_valid" CHECK ("notifications"."template" in ('convite', 'redefinicao_senha', 'confirmacao_email', 'rma_aberto', 'rma_itens_recebidos', 'rma_etapa_alterada', 'rma_cancelado', 'rma_mensagem_equipe', 'rma_mensagem_cliente'));--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_cancellation_consistent" CHECK (("rmas"."cancelled_at" is null) = ("rmas"."cancellation_reason" is null) and ("rmas"."cancelled_at" is null or "rmas"."closed_at" is not null));