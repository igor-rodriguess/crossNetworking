# Plano de lapidação — Plataforma Cross nível 10

> Documento vivo de referência para evoluir a Plataforma Cross de uma aplicação funcional para um produto profissional, confiável e demonstrável para clientes, parceiros e operação interna.
>
> Princípio central: **uma funcionalidade só está pronta quando é útil, compreensível, rastreável, segura e verificável.**

## 1. Norte do produto

A Cross deve ser a plataforma em que uma equipe de parcerias consegue:

1. cadastrar, importar, corrigir e organizar a sua operação sem depender de planilhas dispersas;
2. transformar o briefing de um cliente em frentes de oportunidade claras;
3. descobrir marcas externas com base em evidências públicas, não em sugestões aleatórias;
4. entender por que uma oportunidade foi sugerida, quais fontes a sustentam e o que ainda precisa ser validado;
5. decidir, negociar, formalizar e acompanhar a parceria dentro de um fluxo único e auditável.

O produto não deve parecer uma coleção de telas ou uma demonstração de IA. Deve parecer uma ferramenta de trabalho de alto nível para estrategistas, atendimento, liderança comercial e clientes da Cross.

## 2. Definição objetiva de “nível 10”

Uma nota 10 não significa “muitas funcionalidades”. Significa excelência consistente nos pilares abaixo.

| Pilar | O que caracteriza nota 10 | Evidência exigida |
|---|---|---|
| Valor de negócio | Cada tela apoia uma decisão ou ação real de parceria. | Fluxos completos do briefing ao acompanhamento, sem etapas fictícias. |
| Experiência de uso | O usuário entende o que fazer, o estado atual e a próxima ação sem treinamento técnico. | Teste guiado com usuários internos e ausência de becos sem saída. |
| Qualidade dos dados | Dados podem ser criados, editados, arquivados, importados e rastreados corretamente. | Validações, histórico, prevenção de duplicidade e recuperação de erro. |
| Inteligência artificial | Sugestões são pertinentes ao briefing, trazem evidências e assumem incerteza. | Fontes externas clicáveis, critérios de descarte, confiança e Human Gate. |
| Confiabilidade | A plataforma se comporta previsivelmente mesmo com API, banco ou IA indisponíveis. | Health checks, estados de erro, filas recuperáveis, logs e testes. |
| Segurança e governança | Acesso, auditoria e dados sensíveis são tratados de forma profissional. | Autenticação, autorização, segredo fora do código, trilha de auditoria e backup. |
| Operação | A equipe sabe subir, monitorar, atualizar e recuperar o sistema. | Runbook, deploy repetível, métricas e plano de contingência. |

**Regra de aprovação:** a nota 10 só pode ser declarada quando todos os pilares estiverem em nível alto, sem “maquiagem” de interface e sem dependências críticas não documentadas.

## 3. Estado atual e limites assumidos

### Já disponível

- Plataforma integrada com frontend, API, PostgreSQL, autenticação, cadastros, projetos, frentes, Score Card, parcerias, acompanhamento e auditoria.
- Importação assistida de CSV e leitura de funil histórico.
- Central de oportunidades com fontes, racional, briefing inicial e Human Gate.
- Descoberta externa por DuckDuckGo/Firecrawl, com Ollama local para raciocínio quando aplicável.
- Planejamento de pesquisa orientado pela frente selecionada e por direcionadores opcionais da equipe.
- Gates contra candidatas genéricas, fontes sem credibilidade, marcas já mapeadas e evidências que não tratam do tema prioritário do briefing.
- Demo offline separada da aplicação integrada, para apresentações sem depender de banco ou internet.
- Sondas operacionais da API, banco e Ollama/modelo configurado.

### Limites atuais que não podem ser escondidos

- A descoberta ainda precisa amadurecer com histórico real de curadoria da Cross; não deve prometer assertividade automática.
- O RAG precisa evoluir para embeddings locais reais e avaliação de recuperação antes de ser apresentado como busca semântica de produção.
- A orquestração atual usa pipelines e fila persistida em TypeScript; LangGraph é uma evolução planejada, não uma dependência ativa.
- O Ollama está configurado localmente. O uso por várias máquinas exige implantação em servidor de rede, autenticação e controle de acesso.
- A demo mockada é intencionalmente separada e não pode ser confundida com os dados reais da operação.

## 4. Regras não negociáveis de lapidação

1. **Não adicionar tela sem fluxo.** Toda página precisa ter objetivo, ação principal, estados vazio/carregando/erro e caminho de retorno.
2. **Não adicionar IA sem evidência.** Uma hipótese de parceria precisa informar origem, data, fonte, trecho utilizado, confiança e pendências.
3. **Não salvar dados ambíguos silenciosamente.** Quando a importação ou a IA estiver incerta, o usuário revisa antes de confirmar.
4. **Não confundir cliente, parceiro e oportunidade.** O cliente Cross é quem busca a parceria; as marcas pesquisadas são candidatas, não novos clientes.
5. **Não usar a Base Cross como prova de uma descoberta externa.** Ela orienta, deduplica e contextualiza; a prova do fit vem de fontes externas verificáveis.
6. **Não chamar uma recomendação de decisão.** Toda saída de IA começa como rascunho e passa por validação humana.
7. **Não esconder limitação operacional.** Modo mock, fonte indisponível, baixa confiança e falha de IA devem aparecer claramente.
8. **Não entregar mudança sem teste proporcional ao risco.** Regra de negócio, importação, autorização e persistência exigem teste automatizado.

## 5. Ordem criteriosa de execução

### Fase 0 — Blindagem para apresentação e uso diário

Objetivo: garantir que a plataforma seja demonstrável e utilizável sem surpresas.

- Manter duas entradas claras:
  - **demo offline:** dados mockados, sem dependência de internet;
  - **plataforma integrada:** API, banco e dados reais.
- Criar um roteiro de demonstração de 10 minutos e um roteiro de contingência de 2 minutos.
- Revisar todas as telas para estados vazios, carregamento, erros e permissões.
- Garantir que o usuário consiga editar ou arquivar toda informação que criou, respeitando regras de negócio.
- Validar os links locais, o login, o banco, o Ollama e a importação antes de cada apresentação.

**Critérios de aceite**

- A apresentação pode ser feita sem internet pela demo mockada.
- A versão integrada passa em `GET /health`, `GET /health/db`, `GET /health/ai` e `GET /readyz`.
- Nenhuma tela principal contém texto de roadmap como se fosse funcionalidade ativa.
- Não existe ação visível sem feedback de sucesso, erro ou carregamento.

### Fase 1 — Excelência do dado e dos fluxos operacionais

Objetivo: fazer a plataforma substituir trabalho manual, não apenas registrar informação.

- Revisar campo a campo os cadastros de clientes, partes, projetos, frentes, candidaturas, parcerias e acompanhamento.
- Padronizar labels, ajuda contextual, exemplos, máscaras, obrigatoriedade e validações.
- Consolidar criação, edição, arquivamento lógico, restauração quando aplicável e histórico de alterações.
- Criar importadores para os formatos de planilha mais recorrentes da Cross, com prévia, mapeamento, aviso de ambiguidades e confirmação explícita.
- Medir e reduzir registros duplicados por marca, cliente, contato e oportunidade.

**Critérios de aceite**

- Um usuário não técnico consegue cadastrar uma marca, corrigir um campo e arquivar um erro sem apoio técnico.
- CSV inválido nunca altera a base sem revisão.
- Toda importação informa: quantos itens serão criados, atualizados, ignorados e rejeitados, com o motivo por linha.
- Exclusão de uma entidade respeita dependências e deixa trilha de auditoria.

### Fase 2 — Radar de oportunidades realmente estratégico

Objetivo: transformar o agente em um analista de descoberta, não em um gerador de nomes.

- Fazer a frente selecionada ser a fonte de verdade da pesquisa: território, categoria, objetivo, ativo, público e restrições.
- Permitir direcionadores adicionais da equipe, como público prioritário, posicionamento, janela de calendário, exclusões e ativos desejados.
- Exigir, antes de exibir uma oportunidade:
  - identidade clara da candidata;
  - fonte com credibilidade mínima;
  - menção da própria marca na fonte;
  - sinal de parceria, ativação, patrocínio ou movimento equivalente;
  - aderência ao tema prioritário do briefing;
  - deduplicação contra funil e oportunidades existentes.
- Ponderar o score por seis dimensões de Crossability **e** pela força da evidência.
- Distinguir visualmente hipótese de fonte única, evidência corroborada e oportunidade pronta para curadoria.
- Registrar a razão do descarte em auditoria para que a equipe possa ajustar o briefing e melhorar pesquisas futuras.

**Critérios de aceite**

- Uma frente “corrida” não aceita uma parceria cultural genérica só porque contém a palavra “ativação”.
- Uma frente “Rio Open” exige menção verificável ao evento ou à propriedade equivalente.
- O cartão de oportunidade mostra briefing, fontes, trecho de evidência, confiança, dimensões de fit, pendências e próxima ação.
- Nenhuma sugestão externa nasce como “recomendada” sem Human Gate.
- Cada execução pode ser reproduzida a partir do briefing, consultas e fontes auditadas.

### Fase 3 — RAG profissional e base de conhecimento confiável

Objetivo: transformar documentos da Cross em contexto útil, atualizável e mensurável.

- Definir a taxonomia de documentos: metodologia, briefing, perfil de cliente, case, decisão, contrato, relatório e pesquisa.
- Adotar embeddings locais via Ollama em modelo apropriado, mantendo compatibilidade entre dimensão do vetor, banco e reindexação.
- Criar rotina segura de reindexação quando mudar modelo, chunking ou taxonomia.
- Guardar metadados: fonte, autor, data, cliente, projeto, confidencialidade, versão e validade.
- Criar conjunto de perguntas de avaliação do RAG e medir precisão de recuperação antes de usar contexto em agentes.
- Exibir na interface quais trechos foram recuperados e permitir abrir o documento de origem.

**Critérios de aceite**

- Nenhum agente usa RAG como “fato” sem mostrar o trecho e a origem.
- A busca recupera documentos relevantes em um conjunto de avaliação definido pela equipe.
- Alterar ou remover um documento atualiza seu índice de maneira rastreável.
- O sistema informa explicitamente se está em modo determinístico/local ou vetorial real.

### Fase 4 — Orquestração de agentes e qualidade de decisão

Objetivo: tornar o fluxo de IA previsível, observável e ajustável.

- Evoluir a orquestração para LangGraph quando houver nós, estados, reprocessamentos e aprovações suficientes para justificar a dependência.
- Manter um contrato de entrada e saída versionado para cada agente.
- Separar claramente: planejamento, coleta, credibilidade, extração, resolução de entidade, qualificação, Crossability, ranking, briefing e persistência.
- Implementar limites por etapa: tempo, número de consultas, URLs, candidatas e tentativas.
- Criar fallback seguro: se o Ollama, Firecrawl ou uma fonte falhar, o pipeline deve terminar com estado parcial explicável, nunca inventar resultado.
- Criar uma base de casos de avaliação com briefing, fontes esperadas, candidatas aceitáveis e candidatas que devem ser bloqueadas.

**Critérios de aceite**

- Cada execução informa qual agente rodou, qual origem produziu a saída, quanto tempo levou e qual etapa falhou ou foi pulada.
- O reprocessamento de uma tarefa interrompida não duplica oportunidades.
- Uma mudança em prompt, gate ou modelo pode ser comparada contra casos de avaliação antes de entrar em produção.
- Tempo de execução, custo local, taxa de descarte e taxa de aprovação humana são monitorados.

### Fase 5 — UX, design e linguagem de produto

Objetivo: alcançar uma experiência editorial, clara e eficiente para profissionais.

- Consolidar um design system: hierarquia, tipografia, espaçamento, chips, tabelas, formulários, modais, empty states, feedbacks e acessibilidade.
- Substituir blocos densos por leitura progressiva: resumo executivo primeiro, detalhes sob demanda depois.
- Priorizar a ação de maior valor em cada tela e reduzir botões concorrentes.
- Tornar editáveis todos os campos que fazem parte da operação, com modo de edição claro e salvamento confiável.
- Tratar dados ausentes como oportunidade de ação, não como um fim de linha “não informado”.
- Aplicar responsividade para notebook e telas de apresentação, preservando contraste e legibilidade.

**Critérios de aceite**

- O usuário identifica em até cinco segundos: onde está, qual dado está vendo, o que falta e qual é a próxima ação.
- Formulários têm validação antes do envio, mensagens em linguagem humana e preservação de valores após erro.
- A tela de oportunidade não parece uma notificação: parece uma análise executiva pronta para curadoria.
- Navegação por teclado, foco, contraste e estados desabilitados são verificados nas telas principais.

### Fase 6 — Segurança, governança e operação em rede

Objetivo: deixar a plataforma pronta para uso controlado por múltiplas pessoas e máquinas.

- Implantar API, frontend, banco e Ollama em ambiente de rede com URLs, CORS e segredos de produção adequados.
- Não expor o Ollama diretamente à rede pública; colocá-lo atrás da API/orquestrador ou de camada autenticada.
- Definir perfis de acesso por ação e testar permissões negativas, não apenas positivas.
- Garantir backup, restauração testada, retenção e plano de incidente.
- Proteger métricas, logs e dados pessoais; mascarar informações sensíveis quando necessário.
- Criar observabilidade mínima: logs estruturados, request ID, métricas, health/readiness, alertas e acompanhamento de filas.

**Critérios de aceite**

- Produção não inicia com segredos padrão, CORS aberto ou token de métricas ausente.
- Um usuário sem permissão recebe erro claro e não consegue executar a ação por API.
- Existe teste documentado de backup e restauração.
- Uma indisponibilidade de banco, Ollama ou fonte externa é identificada em poucos minutos.

## 6. Checklist obrigatório por mudança

Antes de considerar uma alteração concluída, confirmar:

- [ ] O problema de negócio e o usuário afetado estão descritos.
- [ ] O fluxo feliz, vazio, carregando, erro e permissão foram considerados.
- [ ] Campos criados podem ser editados ou a imutabilidade foi justificada.
- [ ] Regras de domínio estão no backend/banco, não só no frontend.
- [ ] Há validação de entrada e mensagem clara ao usuário.
- [ ] Não há duplicidade nem perda silenciosa de dados.
- [ ] A mudança possui teste automatizado proporcional ao risco.
- [ ] Typecheck, build e testes relevantes foram executados.
- [ ] A mudança não introduz marca, documento ou dado fictício na base real.
- [ ] A documentação, contrato de API e roteiro de demo foram atualizados quando necessário.

Para mudanças de IA, acrescentar:

- [ ] A entrada contém briefing e limites explícitos.
- [ ] A saída informa origem, evidência, confiança e pendências.
- [ ] O pipeline não usa a Base Cross como prova de descoberta externa.
- [ ] Existe gate de relevância temática e deduplicação.
- [ ] O resultado permanece em rascunho até decisão humana.

## 7. Indicadores para medir maturidade

| Indicador | Meta inicial | Meta nível 10 |
|---|---:|---:|
| Registros criados/importados sem correção manual | ≥ 80% | ≥ 95% |
| Oportunidades externas descartadas por falta de evidência | Medir desde o início | Tendência estável e explicável |
| Oportunidades aprovadas pela curadoria humana | Medir por frente | Crescimento por aprendizado, sem inflar volume |
| Sugestões duplicadas | ≤ 5% | < 1% |
| Tempo para concluir cadastro/importação recorrente | Medir por fluxo | Redução contínua |
| Cobertura de fluxos críticos por teste | ≥ 80% | 100% dos fluxos críticos |
| Falhas detectadas por health checks antes do usuário | Medir | ≥ 95% |
| Tempo de recuperação de tarefa interrompida | Medir | Operação documentada e previsível |

## 8. Roteiro de governança da qualidade

### Ritual semanal

1. revisar as cinco maiores fricções relatadas pela equipe;
2. analisar oportunidades aprovadas, rejeitadas e descartadas pela IA;
3. escolher uma melhoria de alto impacto por fluxo, não várias melhorias superficiais;
4. executar a checklist de mudança;
5. registrar decisão, evidência e resultado no backlog.

### Ritual quinzenal de IA

1. selecionar briefings reais representativos;
2. comparar resultados antes e depois de mudanças em consultas, gates, prompts ou modelo;
3. registrar falsos positivos, falsos negativos e fontes fracas;
4. ajustar a taxonomia e os critérios apenas quando houver evidência;
5. promover a mudança somente se melhorar a qualidade sem reduzir a rastreabilidade.

### Ritual mensal de operação

1. testar backup/restauração;
2. revisar usuários, personas e acessos;
3. revisar logs de erro e tarefas interrompidas;
4. validar saúde de banco, API e Ollama;
5. atualizar o runbook de deploy e apresentação.

## 9. Backlog prioritário sugerido

1. Criar casos reais de avaliação para cada território estratégico da Aramis e clientes futuros.
2. Alimentar o RAG com o PDF metodológico, usando taxonomia e metadados definidos.
3. Preparar embeddings locais reais no Ollama e uma migração/reindexação segura do vetor quando a equipe autorizar o modelo de embeddings.
4. Refinar a tela de oportunidades com histórico de decisão, filtros por confiança/fonte e justificativa de descarte.
5. Completar a revisão de edição manual dos perfis estratégicos, ativos, públicos, territórios e canais.
6. Criar importadores com modelos salvos por cliente/planilha recorrente.
7. Implantar o Ollama em servidor de rede com acesso controlado quando a infraestrutura estiver definida.
8. Introduzir LangGraph somente após consolidar os estados e contratos da orquestração atual.
9. Automatizar validação de release: typecheck, build, testes, migrations pendentes, health checks e smoke test.
10. Criar um painel interno de qualidade: cobertura de dados, saúde dos agentes, confiança de evidência e gargalos de operação.

## 10. Declaração de pronto para produção profissional

A Plataforma Cross estará pronta para ser considerada nível 10 quando puder sustentar, com evidência:

- uma apresentação offline impecável;
- uma operação online estável com múltiplos usuários;
- importação de dados reais sem retrabalho excessivo;
- oportunidades de parceria rastreáveis e relevantes ao briefing;
- decisões humanas registradas sobre toda recomendação de IA;
- recuperação segura diante de falhas;
- documentação suficiente para outro profissional operar e evoluir o produto sem depender de conhecimento implícito.

Até lá, cada entrega deve aproximar o produto desse padrão com profundidade. **Qualidade não é uma fase final; é o critério de entrada de toda mudança.**
