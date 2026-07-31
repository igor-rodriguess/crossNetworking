-- 044 — Grupo empresarial e suas marcas/unidades operacionais.
-- Uma Parte pode representar o grupo; cada marca preserva seu próprio perfil
-- estratégico, ativos, públicos e oportunidades.

CREATE TABLE cross_core.grupo_marca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_parte_id UUID NOT NULL,
    marca_parte_id UUID NOT NULL UNIQUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    criado_por_id UUID,

    CONSTRAINT fk_grupo_marca_grupo
        FOREIGN KEY (grupo_parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_grupo_marca_marca
        FOREIGN KEY (marca_parte_id)
        REFERENCES cross_core.parte(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_grupo_marca_partes_distintas
        CHECK (grupo_parte_id <> marca_parte_id),
    CONSTRAINT uq_grupo_marca
        UNIQUE (grupo_parte_id, marca_parte_id)
);

CREATE INDEX idx_grupo_marca_grupo ON cross_core.grupo_marca (grupo_parte_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON cross_core.grupo_marca TO cross_app;

CREATE TRIGGER trg_grupo_marca_auditoria
AFTER INSERT OR UPDATE OR DELETE ON cross_core.grupo_marca
FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria();

-- Estrutura inicial do cliente já existente. O grupo passa a ser a empresa
-- geral; as três marcas ficam prontas para receber perfis independentes.
DO $$
DECLARE
    grupo_id UUID;
    status_ativa_id UUID;
    marca_id UUID;
    marca_nome TEXT;
BEGIN
    SELECT cc.parte_id INTO grupo_id
      FROM cross_commercial.cliente_cross cc
      JOIN cross_core.parte p ON p.id = cc.parte_id
     WHERE lower(p.nome_exibicao) = 'aramis'
       AND cc.arquivado_em IS NULL
     LIMIT 1;

    IF grupo_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE cross_core.parte
       SET nome_exibicao = 'Grupo Aramis'
     WHERE id = grupo_id
       AND nome_exibicao = 'Aramis';

    SELECT id INTO status_ativa_id
      FROM cross_core.status_parte
     WHERE codigo = 'ativa';

    FOREACH marca_nome IN ARRAY ARRAY['Aramis', 'Urban', 'Aramis Next'] LOOP
        SELECT id INTO marca_id
          FROM cross_core.parte
         WHERE lower(nome_exibicao) = lower(marca_nome)
           AND id <> grupo_id
           AND arquivado_em IS NULL
         LIMIT 1;

        IF marca_id IS NULL THEN
            INSERT INTO cross_core.parte (tipo, nome_exibicao, status_parte_id)
            VALUES ('organizacao', marca_nome, status_ativa_id)
            RETURNING id INTO marca_id;

            INSERT INTO cross_core.organizacao (parte_id, nome_fantasia, segmento_principal)
            VALUES (marca_id, marca_nome, 'Marca do Grupo Aramis');
        END IF;

        INSERT INTO cross_core.grupo_marca (grupo_parte_id, marca_parte_id)
        VALUES (grupo_id, marca_id)
        ON CONFLICT (marca_parte_id) DO UPDATE
          SET grupo_parte_id = EXCLUDED.grupo_parte_id;
    END LOOP;
END $$;
