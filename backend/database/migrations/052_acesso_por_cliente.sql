-- 052 — Escopo de acesso por cliente (isolamento multi-tenant).
--
-- PROBLEMA. Até aqui a autorização respondia apenas "o que esta persona pode
-- fazer" (authz.ts). Não havia resposta para "quais contas esta pessoa pode
-- ver": qualquer usuário autenticado enxergava os dados de todos os clientes.
-- Com uma única conta em operação isso é inócuo; no dia em que a Cross der
-- acesso a alguém de fora — ou a um usuário que só deve ver uma conta — vira
-- vazamento entre clientes (IDOR), o achado nº 1 de qualquer pentest.
--
-- DECISÃO. A Cross é uma agência: as personas internas (administrador,
-- estrategista, gestor_contas, coordenador) continuam vendo todas as contas.
-- O escopo restrito é OPT-IN: só passa a valer para o usuário que tiver
-- vínculos declarados nesta tabela. Nada muda para quem já usa a plataforma.
--
-- Esta migration cria a ESTRUTURA e a função de decisão. O enforcement vive na
-- camada de serviço (usuarios.service/escopo.ts), que é onde as consultas são
-- montadas. RLS no banco é o passo seguinte, recomendado antes de expor a
-- plataforma a usuários externos — ver docs/SAD.md, seção de segurança.

CREATE TABLE cross_core.usuario_cliente_escopo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_interno_id UUID NOT NULL,
    cliente_cross_id UUID NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,
    revogado_em TIMESTAMPTZ,
    revogado_por_id UUID,

    CONSTRAINT fk_escopo_usuario
        FOREIGN KEY (usuario_interno_id) REFERENCES cross_core.usuario_interno(id) ON DELETE RESTRICT,
    CONSTRAINT fk_escopo_cliente
        FOREIGN KEY (cliente_cross_id) REFERENCES cross_commercial.cliente_cross(id) ON DELETE RESTRICT
);

-- Um vínculo ativo por par usuário/cliente. A revogação preserva o histórico
-- (revogado_em) e permite recriar o vínculo depois — mesmo padrão das demais
-- associações do domínio.
CREATE UNIQUE INDEX uq_usuario_cliente_escopo_ativo
    ON cross_core.usuario_cliente_escopo (usuario_interno_id, cliente_cross_id)
    WHERE revogado_em IS NULL;

CREATE INDEX ix_usuario_cliente_escopo_usuario
    ON cross_core.usuario_cliente_escopo (usuario_interno_id)
    WHERE revogado_em IS NULL;

COMMENT ON TABLE cross_core.usuario_cliente_escopo IS
    'Restringe um usuário a clientes específicos. Sem linhas ativas, o usuário '
    'mantém acesso a todas as contas (equipe interna da Cross).';

-- Função de decisão, única fonte de verdade sobre o escopo. Serve tanto à
-- camada de serviço quanto às políticas de RLS quando forem habilitadas.
CREATE OR REPLACE FUNCTION cross_core.usuario_pode_ver_cliente(
    p_usuario_id UUID,
    p_cliente_cross_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT
        -- Sem usuário identificado (jobs internos, migrations): não restringe.
        p_usuario_id IS NULL
        -- Usuário sem escopo declarado: enxerga tudo (equipe interna).
        OR NOT EXISTS (
            SELECT 1 FROM cross_core.usuario_cliente_escopo
             WHERE usuario_interno_id = p_usuario_id AND revogado_em IS NULL
        )
        -- Com escopo declarado: apenas os clientes vinculados.
        OR EXISTS (
            SELECT 1 FROM cross_core.usuario_cliente_escopo
             WHERE usuario_interno_id = p_usuario_id
               AND cliente_cross_id = p_cliente_cross_id
               AND revogado_em IS NULL
        );
$$;

COMMENT ON FUNCTION cross_core.usuario_pode_ver_cliente IS
    'Verdadeiro quando o usuário pode acessar a conta informada. Sem vínculos '
    'declarados, o acesso é amplo — o escopo restrito é opt-in por usuário.';
