-- 051 — Arquiva os resíduos de testes E2E manuais anteriores ao harness de
-- rollback (tests/setup.ts), executados entre 24 e 27/07/2026.
--
-- Sintoma: a Parte foi arquivada ao fim do teste, mas o registro em
-- cliente_cross permaneceu ativo — os nomes "Cli * E2E" e "Cliente * Teste"
-- apareciam no seletor de cliente da interface, misturados às contas reais.
--
-- Não apagamos linhas: `arquivado_em`/`encerrado_em` preservam o rastro para
-- auditoria (RN037) e mantêm as chaves estrangeiras íntegras. O critério é
-- conservador — só atinge registros cuja Parte JÁ está arquivada, portanto
-- nenhuma conta em uso é afetada.

-- 1) Encerra os clientes cuja Parte já foi arquivada.
UPDATE cross_commercial.cliente_cross cc
   SET status_cliente_id = (
         SELECT id FROM cross_commercial.status_cliente
          WHERE codigo = 'encerrado' LIMIT 1
       )
  FROM cross_core.parte p
 WHERE p.id = cc.parte_id
   AND p.arquivado_em IS NOT NULL
   AND EXISTS (SELECT 1 FROM cross_commercial.status_cliente WHERE codigo = 'encerrado');

-- 2) Arquiva as frentes de oportunidade dos projetos desses clientes.
UPDATE cross_projects.frente_oportunidade f
   SET arquivado_em = NOW()
  FROM cross_projects.projeto pr
  JOIN cross_commercial.cliente_cross cc ON cc.id = pr.cliente_cross_id
  JOIN cross_core.parte p ON p.id = cc.parte_id
 WHERE f.projeto_id = pr.id
   AND f.arquivado_em IS NULL
   AND p.arquivado_em IS NOT NULL;

-- 3) Arquiva os projetos desses clientes.
UPDATE cross_projects.projeto pr
   SET arquivado_em = NOW()
  FROM cross_commercial.cliente_cross cc
  JOIN cross_core.parte p ON p.id = cc.parte_id
 WHERE pr.cliente_cross_id = cc.id
   AND pr.arquivado_em IS NULL
   AND p.arquivado_em IS NOT NULL;

-- 4) Arquiva as candidaturas que restaram nessas frentes.
UPDATE cross_projects.candidatura_parceiro c
   SET arquivado_em = NOW()
  FROM cross_projects.frente_oportunidade f
 WHERE c.frente_oportunidade_id = f.id
   AND c.arquivado_em IS NULL
   AND f.arquivado_em IS NOT NULL;
