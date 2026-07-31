-- Responsável interno pela gestão da marca.
-- Não substitui os contatos comerciais, que permanecem no CRM.
ALTER TABLE cross_intelligence.perfil_estrategico
  ADD COLUMN IF NOT EXISTS responsavel_marca TEXT;
