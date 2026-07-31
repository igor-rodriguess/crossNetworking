-- Campo livre para registrar as frentes prioritárias de cada marca.
-- Mantido no perfil versionado para preservar a evolução estratégica.
ALTER TABLE cross_intelligence.perfil_estrategico
  ADD COLUMN IF NOT EXISTS frentes_prioritarias TEXT;
