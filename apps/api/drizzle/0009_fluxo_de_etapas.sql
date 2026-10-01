ALTER TABLE "notifications" DROP CONSTRAINT "notifications_template_valid";--> statement-breakpoint
ALTER TABLE "rma_items" DROP CONSTRAINT "rma_items_sla_with_receipt";--> statement-breakpoint
ALTER TABLE "rma_items" DROP CONSTRAINT "rma_items_stage_valid";--> statement-breakpoint
ALTER TABLE "rma_items" DROP CONSTRAINT "rma_items_received_before_stage";--> statement-breakpoint
ALTER TABLE "rma_items" ADD COLUMN "sla_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rma_items" ADD COLUMN "sla_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rmas" ADD COLUMN "cancelled_by_account_id" uuid;--> statement-breakpoint
-- Fluxo de 01/10/2026: as etapas antigas passam aos nomes do processo.
UPDATE "rma_items" SET "stage" = CASE "stage"
  WHEN 'em_transporte' THEN 'enviado'
  WHEN 'aguardando_cliente' THEN 'aguardando_aprovacao'
  WHEN 'em_testes' THEN 'testes'
  WHEN 'pronto_para_devolucao' THEN 'comprovacao'
  WHEN 'em_devolucao' THEN 'devolucao'
  WHEN 'entregue' THEN 'finalizado'
  ELSE "stage" END;--> statement-breakpoint
-- O prazo passa a começar no diagnóstico. Para os itens que já passaram dele,
-- vale o recebimento, o registro mais próximo que existe.
UPDATE "rma_items" SET "sla_started_at" = "received_at"
  WHERE "stage" NOT IN ('aguardando_envio', 'enviado', 'recebido');--> statement-breakpoint
-- Recebido e ainda não diagnosticado: o prazo ainda não começou.
UPDATE "rma_items" SET "sla_hours" = NULL
  WHERE "stage" IN ('aguardando_envio', 'enviado', 'recebido');--> statement-breakpoint
-- Já despachados: o prazo termina na última movimentação registrada.
UPDATE "rma_items" SET "sla_finished_at" = "updated_at"
  WHERE "stage" IN ('devolucao', 'finalizado');--> statement-breakpoint
ALTER TABLE "rmas" ADD CONSTRAINT "rmas_cancelled_by_account_id_accounts_id_fk" FOREIGN KEY ("cancelled_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_valid" CHECK ("notifications"."template" in ('convite', 'redefinicao_senha', 'confirmacao_email', 'rma_aberto', 'rma_aberto_na_fabrica', 'rma_itens_recebidos', 'rma_etapa_alterada', 'rma_cancelado', 'rma_mensagem_equipe', 'rma_mensagem_cliente'));--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_sla_started_consistent" CHECK (("rma_items"."sla_started_at" is null) = ("rma_items"."sla_hours" is null) and ("rma_items"."sla_hours" is null or "rma_items"."sla_hours" > 0));--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_sla_from_diagnosis" CHECK ("rma_items"."stage" in ('aguardando_envio', 'enviado', 'recebido') or "rma_items"."sla_started_at" is not null);--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_sla_finished_on_dispatch" CHECK (("rma_items"."stage" in ('devolucao', 'finalizado')) = ("rma_items"."sla_finished_at" is not null));--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_stage_valid" CHECK ("rma_items"."stage" in ('aguardando_envio', 'enviado', 'recebido', 'em_diagnostico', 'aguardando_aprovacao', 'em_manutencao', 'aguardando_peca', 'testes', 'comprovacao', 'devolucao', 'finalizado'));--> statement-breakpoint
ALTER TABLE "rma_items" ADD CONSTRAINT "rma_items_received_before_stage" CHECK ("rma_items"."stage" in ('aguardando_envio', 'enviado') or "rma_items"."received_at" is not null);