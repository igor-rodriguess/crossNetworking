-- =============================================================================
-- 056 – Entity Intelligence: evidência persistida e perfil versionado
--
-- Motivação: o Evidence Package do Research & Evidence Agent vive apenas em
-- memória. Sem persistência, a proveniência morre no fim da execução — e a
-- pergunta "o que a plataforma sabia na data da decisão?" fica sem resposta.
--
-- Duas capacidades, mínimas:
--   1. EVIDENCE STORE  — fatos externos verificados, com sua fonte
--   2. PROFILE         — consolidação factual da entidade, versionada
--
-- SEPARAÇÃO PRESERVADA (ADR-009):
--   · evidencia_*          "o que sabemos sobre o mundo"  (externo)
--   · conhecimento_*       "como a Cross interpreta"      (metodologia)
--   · cross_core.parte     identidade e relação interna   (domínio)
--
-- O perfil NÃO duplica dado interno: aponta para a Parte. Nem duplica o corpo
-- das páginas: guarda o claim e a referência à fonte.
--
-- ADITIVA e IDEMPOTENTE. Nenhuma tabela existente é alterada.
--
-- COMPATIBILIDADE
--   Código anterior desconhece estas tabelas e segue funcionando.
--
-- ROLLBACK
--     DROP TABLE IF EXISTS cross_ai.perfil_entidade_versao;
--     DROP TABLE IF EXISTS cross_ai.perfil_entidade;
--     DROP TABLE IF EXISTS cross_ai.evidencia_fato;
--     DROP TABLE IF EXISTS cross_ai.evidencia_fonte;
--     DROP TYPE IF EXISTS cross_ai.vinculo_entidade;
--   Descarta evidência e perfis acumulados. Nenhum dado de domínio, parte,
--   oportunidade ou auditoria é afetado.
-- =============================================================================

-- Status do vínculo entre a entidade pesquisada e uma Parte da base.
-- `nao_vinculada` é o estado de uma empresa pesquisada do zero: o agente NÃO
-- cria Parte automaticamente — a decisão é humana.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'vinculo_entidade' AND n.nspname = 'cross_ai') THEN
        CREATE TYPE cross_ai.vinculo_entidade AS ENUM (
            'vinculada',
            'nao_vinculada',
            'ambigua'
        );
    END IF;
END $$;

-- --- Evidence Store ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS cross_ai.evidencia_fonte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- source_id do Evidence Package (hash da URL): permite reencontrar a mesma
    -- fonte entre execuções sem duplicar.
    source_ref VARCHAR(40) NOT NULL UNIQUE,
    url TEXT NOT NULL,
    titulo TEXT NOT NULL,
    dominio VARCHAR(255) NOT NULL,
    tipo_fonte VARCHAR(30) NOT NULL,
    credibilidade_score SMALLINT NOT NULL,
    credibilidade_nivel VARCHAR(10) NOT NULL,
    credibilidade_sinais JSONB,
    publicado_em TIMESTAMPTZ,
    coletado_em TIMESTAMPTZ NOT NULL,
    query_origem TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cross_ai.evidencia_fato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- fact_id do Evidence Package: hash de (entidade + claim). Reexecutar a
    -- pesquisa e reencontrar o mesmo fato atualiza, não duplica.
    fact_ref VARCHAR(40) NOT NULL UNIQUE,
    entidade VARCHAR(300) NOT NULL,
    -- Parte correspondente, quando resolvida. NULL = ainda não vinculada.
    parte_id UUID,
    claim TEXT NOT NULL,
    categoria VARCHAR(40) NOT NULL,
    natureza VARCHAR(20) NOT NULL,
    verificacao VARCHAR(20) NOT NULL,
    confianca SMALLINT NOT NULL,
    dominios_independentes SMALLINT NOT NULL DEFAULT 0,
    -- source_refs do pacote; a ligação fica em evidencia_fato_fonte.
    publicado_em TIMESTAMPTZ,
    coletado_em TIMESTAMPTZ NOT NULL,
    -- Quando a plataforma registrou o fato (distinto de quando foi publicado
    -- ou coletado): é o instante da observação pela Cross.
    observado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Execução que produziu o fato — liga à telemetria e ao custo.
    execucao_id UUID,
    conflito JSONB,

    CONSTRAINT fk_evidencia_fato_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE SET NULL,
    CONSTRAINT fk_evidencia_fato_execucao
        FOREIGN KEY (execucao_id) REFERENCES cross_ai.execucao_agente(id) ON DELETE SET NULL
);

-- Um fato pode ter várias fontes (corroboração). Tabela de ligação preserva
-- todas — consolidar num campo só perderia a independência dos domínios.
CREATE TABLE IF NOT EXISTS cross_ai.evidencia_fato_fonte (
    fato_id UUID NOT NULL,
    fonte_id UUID NOT NULL,
    PRIMARY KEY (fato_id, fonte_id),
    CONSTRAINT fk_eff_fato FOREIGN KEY (fato_id)
        REFERENCES cross_ai.evidencia_fato(id) ON DELETE CASCADE,
    CONSTRAINT fk_eff_fonte FOREIGN KEY (fonte_id)
        REFERENCES cross_ai.evidencia_fonte(id) ON DELETE CASCADE
);

-- --- Entity Intelligence Profile ---------------------------------------------

CREATE TABLE IF NOT EXISTS cross_ai.perfil_entidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Chave estável: a entidade normalizada. Uma entidade, um perfil, N versões.
    chave_entidade VARCHAR(300) NOT NULL UNIQUE,
    nome_exibicao VARCHAR(300) NOT NULL,
    parte_id UUID,
    vinculo cross_ai.vinculo_entidade NOT NULL DEFAULT 'nao_vinculada',
    -- true enquanto a decisão de vincular/criar Parte não for humana.
    requer_resolucao_humana BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_perfil_parte
        FOREIGN KEY (parte_id) REFERENCES cross_core.parte(id) ON DELETE SET NULL,

    -- Vínculo declarado exige a Parte; sem ela seria vínculo fantasma.
    CONSTRAINT ck_perfil_vinculo
        CHECK (vinculo <> 'vinculada' OR parte_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS cross_ai.perfil_entidade_versao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_id UUID NOT NULL,
    versao INTEGER NOT NULL CHECK (versao >= 1),
    -- Perfil completo, estruturado. JSONB porque a forma evolui com os agentes
    -- e travá-la em colunas agora engessaria a próxima sprint.
    conteudo JSONB NOT NULL,
    -- Hash dos inputs (dados internos + pacote de evidência). Mesmos inputs =
    -- mesmo hash = nenhuma versão nova. É a chave da idempotência.
    hash_entrada VARCHAR(64) NOT NULL,
    -- Diferença em relação à versão anterior: adicionados, atualizados,
    -- conflitantes. Ausência NÃO gera remoção automática.
    diff JSONB,
    fatos_consolidados INTEGER NOT NULL DEFAULT 0,
    conflitos INTEGER NOT NULL DEFAULT 0,
    lacunas INTEGER NOT NULL DEFAULT 0,
    gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    gerado_por_id UUID,

    CONSTRAINT fk_perfil_versao_perfil
        FOREIGN KEY (perfil_id) REFERENCES cross_ai.perfil_entidade(id) ON DELETE CASCADE,
    CONSTRAINT fk_perfil_versao_usuario
        FOREIGN KEY (gerado_por_id) REFERENCES cross_core.usuario_interno(id) ON DELETE SET NULL,
    CONSTRAINT uq_perfil_versao UNIQUE (perfil_id, versao)
);

CREATE INDEX IF NOT EXISTS idx_evidencia_fato_entidade
    ON cross_ai.evidencia_fato (entidade, observado_em DESC);
CREATE INDEX IF NOT EXISTS idx_evidencia_fato_parte
    ON cross_ai.evidencia_fato (parte_id) WHERE parte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfil_versao_perfil
    ON cross_ai.perfil_entidade_versao (perfil_id, versao DESC);
CREATE INDEX IF NOT EXISTS idx_perfil_versao_hash
    ON cross_ai.perfil_entidade_versao (perfil_id, hash_entrada);

COMMENT ON TABLE cross_ai.evidencia_fato IS
    'Evidence Store: fatos externos verificados. NÃO é conhecimento metodológico.';
COMMENT ON TABLE cross_ai.perfil_entidade_versao IS
    'Snapshot factual da entidade. Permite saber o que se sabia na data da decisão.';
COMMENT ON COLUMN cross_ai.perfil_entidade.requer_resolucao_humana IS
    'O agente nunca cria Parte automaticamente; a decisão de vincular é humana.';

GRANT SELECT, INSERT, UPDATE ON cross_ai.evidencia_fonte TO cross_app;
GRANT SELECT, INSERT, UPDATE ON cross_ai.evidencia_fato TO cross_app;
GRANT SELECT, INSERT, DELETE ON cross_ai.evidencia_fato_fonte TO cross_app;
GRANT SELECT, INSERT, UPDATE ON cross_ai.perfil_entidade TO cross_app;
GRANT SELECT, INSERT ON cross_ai.perfil_entidade_versao TO cross_app;
