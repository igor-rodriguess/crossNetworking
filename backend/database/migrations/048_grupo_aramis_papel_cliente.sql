-- A visão "Clientes — quem busca a Cross" é orientada pelo papel da Parte.
-- Grupo Aramis e suas três marcas devem aparecer nela como contas atendidas.
WITH papel_cliente AS (
  SELECT id FROM cross_core.papel WHERE codigo = 'cliente' LIMIT 1
), grupo AS (
  SELECT id FROM cross_core.parte
   WHERE lower(nome_exibicao) = 'grupo aramis' AND arquivado_em IS NULL
   LIMIT 1
), partes_do_grupo AS (
  SELECT id AS parte_id FROM grupo
  UNION
  SELECT gm.marca_parte_id
    FROM cross_core.grupo_marca gm
    JOIN grupo g ON g.id = gm.grupo_parte_id
)
INSERT INTO cross_core.parte_papel (parte_id, papel_id, vigente_desde)
SELECT pg.parte_id, pc.id, CURRENT_DATE
  FROM partes_do_grupo pg
 CROSS JOIN papel_cliente pc
 WHERE NOT EXISTS (
   SELECT 1
     FROM cross_core.parte_papel pp
    WHERE pp.parte_id = pg.parte_id
      AND pp.papel_id = pc.id
      AND pp.arquivado_em IS NULL
 );
