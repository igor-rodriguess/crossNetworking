-- =============================================================================
-- 025 – Autenticação e sessões (RF001)
--
-- • persona controlada no usuário interno (casa com o middleware de autorização);
-- • credenciais em tabela SEPARADA e NÃO auditada — o hash da senha nunca entra
--   na trilha de auditoria (que registra row_to_json de usuario_interno);
-- • refresh tokens com rotação e revogação — guardamos só o hash do token.
--
-- Aditiva e idempotente (WAD 7.4.22).
-- =============================================================================

-- Persona (papel de autorização) — vocabulário fechado, igual ao middleware.
ALTER TABLE cross_core.usuario_interno
    ADD COLUMN IF NOT EXISTS persona VARCHAR(30);

ALTER TABLE cross_core.usuario_interno
    DROP CONSTRAINT IF EXISTS ck_usuario_interno_persona;
ALTER TABLE cross_core.usuario_interno
    ADD CONSTRAINT ck_usuario_interno_persona
    CHECK (persona IS NULL OR persona IN
        ('estrategista', 'gestor_contas', 'coordenador', 'administrador'));

-- Credenciais isoladas — fora do alcance da auditoria de usuario_interno.
CREATE TABLE IF NOT EXISTS cross_core.credencial_usuario (
    usuario_id UUID PRIMARY KEY,
    senha_hash TEXT NOT NULL,
    senha_atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_credencial_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE CASCADE
);

-- Sessões (refresh tokens). Guardamos o SHA-256 do token, nunca o token cru.
CREATE TABLE IF NOT EXISTS cross_core.sessao_refresh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL,
    user_agent TEXT,
    ip VARCHAR(64),
    expira_em TIMESTAMPTZ NOT NULL,
    revogado_em TIMESTAMPTZ,
    substituido_por_id UUID,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sessao_refresh_token UNIQUE (token_hash),
    CONSTRAINT fk_sessao_refresh_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES cross_core.usuario_interno(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_sessao_refresh_substituido
        FOREIGN KEY (substituido_por_id)
        REFERENCES cross_core.sessao_refresh(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessao_refresh_usuario_ativo
    ON cross_core.sessao_refresh (usuario_id)
    WHERE revogado_em IS NULL;

-- Privilégios do papel de aplicação sobre as novas tabelas.
GRANT SELECT, INSERT, UPDATE, DELETE ON cross_core.credencial_usuario TO cross_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cross_core.sessao_refresh TO cross_app;
