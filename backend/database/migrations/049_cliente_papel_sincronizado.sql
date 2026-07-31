-- Uma Parte que possui vínculo comercial ativo também precisa aparecer como
-- cliente na Base de Relacionamentos. Mantemos eventuais papéis de parceira:
-- eles representam capacidades e histórico, não cadastros duplicados.
WITH papel_cliente AS (
  SELECT id FROM cross_core.papel WHERE codigo = 'cliente' LIMIT 1
)
INSERT INTO cross_core.parte_papel (parte_id, papel_id, vigente_desde)
SELECT cc.parte_id, pc.id, CURRENT_DATE
  FROM cross_commercial.cliente_cross cc
 CROSS JOIN papel_cliente pc
 WHERE cc.arquivado_em IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM cross_core.parte_papel pp
      WHERE pp.parte_id = cc.parte_id
        AND pp.papel_id = pc.id
        AND pp.arquivado_em IS NULL
   );
