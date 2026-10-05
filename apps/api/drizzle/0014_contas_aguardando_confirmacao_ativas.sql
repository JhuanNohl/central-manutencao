-- Autocadastro não exige mais a confirmação do e-mail (02/10/2026): as contas
-- que aguardavam o link ficam ativas. Contas com senha provisória continuam
-- pendentes até a troca no primeiro acesso.
UPDATE "accounts"
SET "email_verified_at" = "created_at"
WHERE "email_verified_at" IS NULL AND "password_change_required" = false;
