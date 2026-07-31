-- A marca Aramis também é uma conta operacional da Cross, além de pertencer
-- ao Grupo Aramis. Isso permite encontrá-la diretamente na visão de Clientes.
DO $$
DECLARE
  aramis_parte_id UUID;
  status_ativo_id UUID;
BEGIN
  SELECT p.id INTO aramis_parte_id
    FROM cross_core.parte p
   WHERE lower(p.nome_exibicao) = 'aramis'
     AND p.arquivado_em IS NULL
   LIMIT 1;

  SELECT id INTO status_ativo_id
    FROM cross_commercial.status_cliente
   WHERE codigo = 'ativo'
   LIMIT 1;

  IF aramis_parte_id IS NOT NULL
     AND status_ativo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM cross_commercial.cliente_cross cc
        WHERE cc.parte_id = aramis_parte_id
          AND cc.arquivado_em IS NULL
     ) THEN
    INSERT INTO cross_commercial.cliente_cross (parte_id, status_cliente_id)
    VALUES (aramis_parte_id, status_ativo_id);
  END IF;
END $$;
