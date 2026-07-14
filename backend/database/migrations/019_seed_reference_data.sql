-- =============================================================================
-- 019 – Seeds de dados de referência (WAD 7.4.23)
-- Apenas vocabulários controlados; nenhum dado operacional fictício.
-- =============================================================================

-- cross_core -----------------------------------------------------------------

INSERT INTO cross_core.status_parte (codigo, nome, ordem) VALUES
    ('ativa', 'Ativa', 1),
    ('inativa', 'Inativa', 2)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_core.papel (codigo, nome, ordem) VALUES
    ('cliente', 'Cliente', 1),
    ('parceiro', 'Parceiro', 2),
    ('patrocinador', 'Patrocinador', 3),
    ('fornecedor', 'Fornecedor', 4),
    ('agencia', 'Agência', 5),
    ('produtora', 'Produtora', 6),
    ('gravadora', 'Gravadora', 7),
    ('veiculo_midia', 'Veículo de Mídia', 8),
    ('artista', 'Artista', 9),
    ('influenciador', 'Influenciador', 10),
    ('atleta', 'Atleta', 11),
    ('especialista', 'Especialista', 12),
    ('personalidade', 'Personalidade', 13)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_core.tipo_organizacao (codigo, nome, ordem) VALUES
    ('empresa', 'Empresa', 1),
    ('marca', 'Marca', 2),
    ('agencia', 'Agência', 3),
    ('fornecedor', 'Fornecedor', 4),
    ('produtora', 'Produtora', 5),
    ('gravadora', 'Gravadora', 6),
    ('veiculo_midia', 'Veículo de Mídia', 7)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_core.status_documento (codigo, nome, ordem) VALUES
    ('ativo', 'Ativo', 1),
    ('substituido', 'Substituído', 2),
    ('arquivado', 'Arquivado', 3)
ON CONFLICT (codigo) DO NOTHING;

-- cross_intelligence ----------------------------------------------------------

INSERT INTO cross_intelligence.tipo_disponibilidade (codigo, nome, ordem) VALUES
    ('disponivel', 'Disponível', 1),
    ('indisponivel', 'Indisponível', 2),
    ('parcial', 'Parcialmente disponível', 3),
    ('reservado', 'Reservado', 4)
ON CONFLICT (codigo) DO NOTHING;

-- Territórios iniciais (WAD 7.4.23)
INSERT INTO cross_intelligence.territorio (codigo, nome) VALUES
    ('musica', 'Música'),
    ('esporte', 'Esporte'),
    ('gastronomia', 'Gastronomia'),
    ('moda', 'Moda'),
    ('entretenimento', 'Entretenimento'),
    ('games', 'Games'),
    ('cultura', 'Cultura'),
    ('lifestyle', 'Lifestyle'),
    ('educacao', 'Educação'),
    ('sustentabilidade', 'Sustentabilidade')
ON CONFLICT (codigo) DO NOTHING;

-- cross_commercial ------------------------------------------------------------

INSERT INTO cross_commercial.status_cliente (codigo, nome, ordem) VALUES
    ('ativo', 'Ativo', 1),
    ('inativo', 'Inativo', 2),
    ('suspenso', 'Suspenso', 3),
    ('encerrado', 'Encerrado', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_commercial.status_contrato (codigo, nome, ordem) VALUES
    ('em_negociacao', 'Em negociação', 1),
    ('vigente', 'Vigente', 2),
    ('suspenso', 'Suspenso', 3),
    ('encerrado', 'Encerrado', 4),
    ('cancelado', 'Cancelado', 5)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_commercial.modelo_contratacao (codigo, nome, ordem) VALUES
    ('fee_mensal', 'Fee Mensal', 1),
    ('projeto_pontual', 'Projeto Pontual', 2),
    ('success_fee', 'Success Fee', 3),
    ('outro', 'Outro', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_commercial.tipo_remuneracao (codigo, nome, ordem) VALUES
    ('valor_mensal', 'Valor mensal', 1),
    ('valor_por_projeto', 'Valor fechado por projeto', 2),
    ('comissao_patrocinio', 'Comissão por patrocínio', 3),
    ('comissao_influenciador', 'Comissão por influenciador', 4),
    ('percentual_negocio', 'Percentual sobre negócio fechado', 5),
    ('outro', 'Outro', 6)
ON CONFLICT (codigo) DO NOTHING;

-- cross_projects ----------------------------------------------------------------

INSERT INTO cross_projects.status_projeto (codigo, nome, ordem) VALUES
    ('rascunho', 'Rascunho', 1),
    ('planejamento', 'Planejamento', 2),
    ('em_andamento', 'Em andamento', 3),
    ('em_validacao', 'Em validação', 4),
    ('suspenso', 'Suspenso', 5),
    ('concluido', 'Concluído', 6),
    ('cancelado', 'Cancelado', 7),
    ('arquivado', 'Arquivado', 8)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_projects.status_frente (codigo, nome, ordem) VALUES
    ('aberta', 'Aberta', 1),
    ('em_andamento', 'Em andamento', 2),
    ('suspensa', 'Suspensa', 3),
    ('encerrada', 'Encerrada', 4),
    ('reaberta', 'Reaberta', 5)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_projects.status_candidatura (codigo, nome, ordem) VALUES
    ('identificada', 'Identificada', 1),
    ('em_analise', 'Em análise', 2),
    ('recomendada', 'Recomendada', 3),
    ('apresentada', 'Apresentada', 4),
    ('aprovada', 'Aprovada', 5),
    ('recusada_cliente', 'Recusada pelo cliente', 6),
    ('recusada_parceiro', 'Recusada pelo parceiro', 7),
    ('em_negociacao', 'Em negociação', 8),
    ('stand_by', 'Stand-by', 9),
    ('encerrada', 'Encerrada', 10)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_projects.prioridade (codigo, nome, ordem) VALUES
    ('alta', 'Alta', 1),
    ('media', 'Média', 2),
    ('baixa', 'Baixa', 3)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_projects.tipo_origem_demanda (codigo, nome, ordem) VALUES
    ('briefing_cliente', 'Briefing do cliente', 1),
    ('oportunidade_cross', 'Oportunidade identificada pela Cross', 2),
    ('prospeccao_ativa', 'Prospecção ativa', 3),
    ('concorrencia', 'Concorrência', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_projects.nivel_interesse (codigo, nome, ordem) VALUES
    ('alto', 'Alto', 1),
    ('medio', 'Médio', 2),
    ('baixo', 'Baixo', 3),
    ('desconhecido', 'Desconhecido', 4)
ON CONFLICT (codigo) DO NOTHING;

-- cross_methodologies -----------------------------------------------------------

INSERT INTO cross_methodologies.status_crossability (codigo, nome, ordem) VALUES
    ('em_elaboracao', 'Em elaboração', 1),
    ('concluida', 'Concluída', 2),
    ('revisada', 'Revisada', 3),
    ('arquivada', 'Arquivada', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_methodologies.status_paper (codigo, nome, ordem) VALUES
    ('em_elaboracao', 'Em elaboração', 1),
    ('em_validacao', 'Em validação', 2),
    ('validado', 'Validado', 3),
    ('reprovado', 'Reprovado', 4),
    ('arquivado', 'Arquivado', 5)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_methodologies.status_validacao (codigo, nome, ordem) VALUES
    ('pendente', 'Pendente', 1),
    ('aprovada', 'Aprovada', 2),
    ('aprovada_com_ajustes', 'Aprovada com ajustes', 3),
    ('reprovada', 'Reprovada', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_methodologies.tipo_validacao (codigo, nome, ordem) VALUES
    ('interna', 'Interna', 1),
    ('cliente', 'Cliente', 2),
    ('juridica', 'Jurídica', 3),
    ('comercial', 'Comercial', 4),
    ('outra', 'Outra', 5)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_methodologies.status_avaliacao_score_card (codigo, nome, ordem) VALUES
    ('em_andamento', 'Em andamento', 1),
    ('concluida', 'Concluída', 2),
    ('cancelada', 'Cancelada', 3)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_methodologies.tipo_decisao (codigo, nome, ordem) VALUES
    ('priorizada', 'Priorizada', 1),
    ('aprovada', 'Aprovada', 2),
    ('rejeitada_cliente', 'Rejeitada pelo cliente', 3),
    ('recusada_parceiro', 'Recusada pelo parceiro', 4),
    ('stand_by', 'Stand-by', 5),
    ('em_negociacao', 'Em negociação', 6),
    ('reaberta', 'Reaberta', 7),
    ('encerrada', 'Encerrada', 8)
ON CONFLICT (codigo) DO NOTHING;

-- cross_partnerships ------------------------------------------------------------

INSERT INTO cross_partnerships.status_parceria (codigo, nome, ordem) VALUES
    ('em_estruturacao', 'Em estruturação', 1),
    ('ativa', 'Ativa', 2),
    ('suspensa', 'Suspensa', 3),
    ('encerrada', 'Encerrada', 4),
    ('cancelada', 'Cancelada', 5)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_partnerships.status_negociacao (codigo, nome, ordem) VALUES
    ('em_andamento', 'Em andamento', 1),
    ('concluida', 'Concluída', 2),
    ('stand_by', 'Stand-by', 3),
    ('cancelada', 'Cancelada', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_partnerships.tipo_parceria (codigo, nome, ordem) VALUES
    ('patrocinio', 'Patrocínio', 1),
    ('licenciamento', 'Licenciamento', 2),
    ('co_branding', 'Co-branding', 3),
    ('ativacao', 'Ativação', 4),
    ('conteudo', 'Conteúdo', 5),
    ('evento', 'Evento', 6),
    ('outro', 'Outro', 7)
ON CONFLICT (codigo) DO NOTHING;

-- cross_execution ---------------------------------------------------------------

INSERT INTO cross_execution.status_execucao (codigo, nome, ordem) VALUES
    ('nao_iniciado', 'Não iniciado', 1),
    ('em_andamento', 'Em andamento', 2),
    ('concluido', 'Concluído', 3),
    ('atrasado', 'Atrasado', 4),
    ('cancelado', 'Cancelado', 5)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_execution.status_entrega (codigo, nome, ordem) VALUES
    ('pendente', 'Pendente', 1),
    ('em_producao', 'Em produção', 2),
    ('entregue', 'Entregue', 3),
    ('aprovada', 'Aprovada', 4),
    ('atrasada', 'Atrasada', 5),
    ('cancelada', 'Cancelada', 6)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cross_execution.status_pendencia (codigo, nome, ordem) VALUES
    ('aberta', 'Aberta', 1),
    ('em_tratamento', 'Em tratamento', 2),
    ('resolvida', 'Resolvida', 3),
    ('cancelada', 'Cancelada', 4)
ON CONFLICT (codigo) DO NOTHING;

-- cross_analytics ---------------------------------------------------------------

INSERT INTO cross_analytics.tipo_metrica (codigo, nome, ordem) VALUES
    ('alcance', 'Alcance', 1),
    ('impressoes', 'Impressões', 2),
    ('engajamento', 'Engajamento', 3),
    ('conversao', 'Conversão', 4),
    ('vendas', 'Vendas', 5),
    ('midia_espontanea', 'Mídia espontânea', 6),
    ('awareness', 'Awareness', 7)
ON CONFLICT (codigo) DO NOTHING;
