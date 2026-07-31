-- 050 — Status operacionais de candidatura, alinhados à planilha de trabalho
-- da Cross. Os status existentes descrevem a POSIÇÃO no funil; os novos
-- descrevem DE QUEM É A PRÓXIMA AÇÃO, que é o que move o trabalho no dia a dia:
-- saber se a bola está com a Cross, com o cliente ou com a marca parceira.
--
-- Nomenclatura genérica ("cliente", "parceiro") porque o vocabulário serve
-- todas as contas; a interface exibe o nome real do cliente ativo.
--
-- Mapeamento com a planilha (coluna STATUS):
--   EM NEGOCIAÇÃO                      -> em_negociacao        (já existia)
--   STAND BY                           -> stand_by             (já existia)
--   DECLINADO MARCA                    -> recusada_parceiro    (já existia)
--   DECLINADO ARAMIS                   -> recusada_cliente     (já existia)
--   ABRIR FRENTE                       -> abrir_frente         (novo)
--   FRENTE ABERTA                      -> frente_aberta        (novo)
--   FRENTE ABERTA/AGUARDANDO PARCEIRO  -> aguardando_parceiro  (novo)
--   VALIDAR COM ARAMIS                 -> validar_com_cliente  (novo)
--   AGUARDANDO OK ARAMIS               -> aguardando_ok_cliente(novo)
--   PARCERIA EM ANDAMENTO              -> parceria_andamento   (novo)
--
-- A ordem continua a leitura do funil: os novos ficam entre "apresentada" e
-- "aprovada", que é onde a conversa comercial de fato acontece. Os códigos
-- existentes não são alterados — nenhuma candidatura muda de status aqui.

INSERT INTO cross_projects.status_candidatura (codigo, nome, descricao, ordem, ativo)
VALUES
  ('abrir_frente',          'Abrir frente',
   'Oportunidade identificada; a frente com a marca ainda precisa ser aberta pela Cross.', 11, true),

  ('frente_aberta',         'Frente aberta',
   'Contato iniciado com a marca; conversa em curso sob condução da Cross.', 12, true),

  ('aguardando_parceiro',   'Frente aberta · aguardando parceiro',
   'A frente está aberta e a próxima ação é da marca parceira (retorno, proposta ou material).', 13, true),

  ('validar_com_cliente',   'Validar com o cliente',
   'A Cross precisa validar a oportunidade com o cliente antes de avançar com a marca.', 14, true),

  ('aguardando_ok_cliente', 'Aguardando OK do cliente',
   'Proposta apresentada ao cliente; a próxima ação é dele.', 15, true),

  ('parceria_andamento',    'Parceria em andamento',
   'Parceria acordada e em execução. O contrato e as contrapartidas vivem em cross_partnerships.parceria.', 16, true)
ON CONFLICT (codigo) DO NOTHING;
