-- Itens recebidos antes do registro do prazo aplicado (dados sintéticos da
-- fatia inicial da E1) recebem o prazo padrão da P01: 720 horas. Precisa
-- rodar antes da restrição que exige o prazo em todo item recebido (0005).
UPDATE "rma_items" SET "sla_hours" = 720
  WHERE "received_at" IS NOT NULL AND "sla_hours" IS NULL;
