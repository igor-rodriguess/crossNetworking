-- =============================================================================
-- 021 – Endurecimento de integridade de dados
-- Constraints adicionais que impedem dados inválidos/sujos no nível do banco.
-- Aditivo; não altera migrations anteriores (WAD 7.4.22). Tabelas ainda sem
-- dados operacionais, então a validação das constraints é instantânea.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Formatos de documentos e contato (só validam quando preenchidos)
-- -----------------------------------------------------------------------------

ALTER TABLE cross_core.organizacao
    ADD CONSTRAINT ck_organizacao_cnpj_formato
    CHECK (cnpj IS NULL OR cnpj ~ '^\d{14}$');

ALTER TABLE cross_core.pessoa
    ADD CONSTRAINT ck_pessoa_cpf_formato
    CHECK (cpf IS NULL OR cpf ~ '^\d{11}$');

ALTER TABLE cross_core.usuario_interno
    ADD CONSTRAINT ck_usuario_interno_email_formato
    CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

ALTER TABLE cross_core.contato
    ADD CONSTRAINT ck_contato_email_formato
    CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- E-mail de usuário único também de forma case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_interno_email_lower
    ON cross_core.usuario_interno (lower(email));

-- -----------------------------------------------------------------------------
-- Texto obrigatório não pode ser vazio/em branco
-- -----------------------------------------------------------------------------

ALTER TABLE cross_core.parte
    ADD CONSTRAINT ck_parte_nome_nao_vazio CHECK (btrim(nome_exibicao) <> '');

ALTER TABLE cross_core.usuario_interno
    ADD CONSTRAINT ck_usuario_interno_nome_nao_vazio CHECK (btrim(nome) <> '');

ALTER TABLE cross_core.organizacao
    ADD CONSTRAINT ck_organizacao_nome_fantasia_nao_vazio CHECK (btrim(nome_fantasia) <> '');

ALTER TABLE cross_core.pessoa
    ADD CONSTRAINT ck_pessoa_nome_completo_nao_vazio CHECK (btrim(nome_completo) <> '');

ALTER TABLE cross_core.documento
    ADD CONSTRAINT ck_documento_nome_nao_vazio CHECK (btrim(nome) <> '');

ALTER TABLE cross_projects.projeto
    ADD CONSTRAINT ck_projeto_nome_nao_vazio CHECK (btrim(nome) <> '');

ALTER TABLE cross_projects.frente_oportunidade
    ADD CONSTRAINT ck_frente_nome_nao_vazio CHECK (btrim(nome) <> '');

-- -----------------------------------------------------------------------------
-- Faixas numéricas: versões, ordens e pesos
-- -----------------------------------------------------------------------------

ALTER TABLE cross_intelligence.perfil_estrategico
    ADD CONSTRAINT ck_perfil_estrategico_versao_pos CHECK (numero_versao >= 1);
ALTER TABLE cross_projects.briefing
    ADD CONSTRAINT ck_briefing_versao_pos CHECK (numero_versao >= 1);
ALTER TABLE cross_projects.planejamento_estrategico
    ADD CONSTRAINT ck_planejamento_versao_pos CHECK (numero_versao >= 1);
ALTER TABLE cross_methodologies.analise_crossability
    ADD CONSTRAINT ck_analise_crossability_versao_pos CHECK (numero_versao >= 1);
ALTER TABLE cross_methodologies.versao_paper
    ADD CONSTRAINT ck_versao_paper_versao_pos CHECK (numero_versao >= 1);
ALTER TABLE cross_methodologies.versao_modelo_score_card
    ADD CONSTRAINT ck_versao_modelo_score_card_versao_pos CHECK (numero_versao >= 1);
ALTER TABLE cross_execution.plano_execucao
    ADD CONSTRAINT ck_plano_execucao_versao_pos CHECK (numero_versao >= 1);

ALTER TABLE cross_methodologies.criterio_score_card
    ADD CONSTRAINT ck_criterio_ordem_nao_neg CHECK (ordem >= 0);
ALTER TABLE cross_methodologies.criterio_score_card
    ADD CONSTRAINT ck_criterio_pesos_nao_neg CHECK (peso_sim >= 0 AND peso_nao >= 0);
ALTER TABLE cross_execution.etapa_execucao
    ADD CONSTRAINT ck_etapa_ordem_nao_neg CHECK (ordem >= 0);

ALTER TABLE cross_core.documento
    ADD CONSTRAINT ck_documento_versao_pos CHECK (numero_versao >= 1);

-- -----------------------------------------------------------------------------
-- Hash de documento no formato SHA-256 (64 hexadecimais)
-- -----------------------------------------------------------------------------

ALTER TABLE cross_core.documento
    ADD CONSTRAINT ck_documento_hash_sha256_formato
    CHECK (hash_sha256 ~ '^[0-9a-fA-F]{64}$');
