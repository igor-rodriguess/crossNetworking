# 02 — Matriz de Poda do Produto

**Plataforma Cross** · Sprint 0
Data: 07/08/2026

> **Nenhuma classificação desta matriz autoriza exclusão.** `REMOVE_SAFE` é a
> classificação mais forte e significa apenas: *há evidência técnica de que a
> remoção futura teria baixo risco*. A remoção em si exige aprovação humana
> explícita e ocorre em sprint posterior.

## Legenda

| Classe | Significado |
|---|---|
| **KEEP** | Essencial para a Cross Intelligence. Preservar como está. |
| **SIMPLIFY** | Necessário, mas precisa ser reduzido ou reorganizado. |
| **HIDE** | Continua existindo tecnicamente; sai da experiência principal agora. |
| **DEPRECATE** | Provavelmente não pertence mais ao produto; não excluir ainda. |
| **REMOVE_SAFE** | Evidência de ausência de dependência relevante; baixo risco futuro. |

Risco: **Baixo** (sem dependência conhecida) · **Médio** (dependência de
interface ou dado) · **Alto** (regra de negócio, segurança ou dado real).

---

## A. Camada de Inteligência (o novo núcleo)

| Componente | Localização | Responsabilidade atual | Dependências | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Pipeline de agentes (13 agentes) | `backend/src/modules/agentes/*.agent.ts` | Planning→Recommendation completo | `llm.ts`, `firecrawl.ts`, `web-search.ts`, `execucao_agente` | **KEEP** | É exatamente o pipeline conceitual do briefing, já implementado | Alto | Preservar. Decompor o service na Fase E |
| Human Gate | `agentes.routes.ts` (`POST /agentes/human-gate`), migration 034 | Promove rascunho a domínio | `oportunidade_ia` | **KEEP** | Requisito não-negociável: IA propõe, humano valida | Alto | Não tocar |
| `execucao_agente` | migration 026 | Auditoria de execução com tokens e duração | — | **KEEP** | Já cobre `model`, tokens, latência, status | Alto | Estender na Fase E (custo, tool_calls) |
| `tarefa_pipeline` | migration 042 | Execução assíncrona com progresso | `execucao_agente` | **KEEP** | Resolve timeout de LLM local; base do AgentRun | Alto | Preservar |
| `oportunidade_ia` | migration 039/043 | Rascunho auditável com fontes e score | `execucao_agente` | **KEEP** | É a entidade Opportunity do produto novo | Alto | Preservar; virar entidade de primeira classe |
| RAG (`documento_rag`) | migrations 035/036, `rag.service.ts` | Base vetorial, índice HNSW | pgvector | **KEEP** | KnowledgeChunk já existe | Médio | Preservar; ampliar ingestão |
| Cliente LLM plugável | `agentes/shared/llm.ts` | OpenAI/DeepSeek/Ollama, timeout, fallback | `env` | **KEEP** | Provider abstraction já resolvida | Médio | Preservar |
| Firecrawl / web-search | `agentes/shared/` | Coleta externa | chave opcional | **KEEP** | Necessário às três jornadas | Baixo | Preservar desligado |
| `agentes.service.ts` (2.153 linhas) | `backend/src/modules/agentes` | Orquestra tudo | Todo o módulo | **SIMPLIFY** | Maior arquivo do backend; concentra o que deveria ser Agent Framework | Alto | Decompor por pipeline na Fase E, sem mudar comportamento |
| Rotas por etapa (9 rotas) | `agentes.routes.ts` | Uma rota por etapa do pipeline | — | **KEEP** | Valiosas para teste e depuração isolada | Baixo | Manter fora da navegação principal |

---

## B. Relacionamentos e Inteligência de Entidade

| Componente | Localização | Responsabilidade atual | Dependências | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Partes (organizações/pessoas) | `modules/partes` (13 rotas), `cross_core` | Identidade única da base | Tudo | **KEEP** | Componente 1 do novo núcleo | Alto | Preservar |
| Perfil estratégico, ativos, públicos, territórios, praças | `modules/inteligencia` (38 rotas), `cross_intelligence` | Inteligência de entidade | `partes` | **KEEP** | Componentes 3–7 do novo núcleo; alimentam o Crossability | Alto | Preservar |
| `Partes.tsx` / `ParteDetalhe.tsx` | `frontend/src/pages` | Lista e ficha da parte | API + **mock `PARCERIAS`** | **SIMPLIFY** | Central no produto novo, mas contaminada por mock | Médio | Remover import de mock; consumir API |
| Artistas & Big Moments | `pages/Artistas.tsx` (402 linhas) | Perfis de artistas e momentos | `partes` | **KEEP** | Componentes 14–15 do novo núcleo | Médio | Preservar; revisar posição no menu |
| Clientes Cross | `modules/clientes` (13 rotas) | Conta contratante | `partes` | **KEEP** | Componente 2; define o recorte da plataforma | Alto | Preservar |
| `Clientes.tsx` | `pages/Clientes.tsx` (97 linhas) | Lista de clientes | Seletor do AppShell | **SIMPLIFY** | Já fora do menu, mas ainda alcançável pelo seletor | Médio | Decidir: reintegrar ao menu ou substituir pelo seletor |
| Documentos | `modules/documentos` (5 rotas) | Documentos por parte | `cross_core` | **KEEP** | Componente 13; insumo de RAG | Baixo | Preservar; **hoje sem interface** — ver §E |
| Evidências e fontes | `modules/governanca` (9 rotas) | Auditoria, evidências, fontes | `cross_governance` | **KEEP** | Componente 11; sustenta rastreabilidade da IA | Alto | Preservar; **hoje sem interface** |

---

## C. Metodologia

| Componente | Localização | Responsabilidade atual | Dependências | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Cross Score Card | `modules/metodologias`, `pages/ScoreCard.tsx` | Avaliação ponderada | RN022, RN023 (triggers) | **KEEP** | Componente 9; sustenta a recomendação ao cliente | Alto | Não tocar nas regras |
| Crossability | `crossability-reasoning.agent.ts`, `modules/metodologias` | Seis dimensões | LLM + metodologias | **KEEP** | Componente 8; passa a ser motor, não ferramenta manual | Alto | Manter motor; reduzir exposição como ferramenta operacional |
| Modelos/versões de Score Card | `metodologias` (6 rotas) | Modelo por cliente com vigência | RN022 | **KEEP** | Permite modelo próprio por cliente | Alto | Preservar |
| `Criterios.tsx` | `pages/Criterios.tsx` (235 linhas) | Edição de critérios e pesos | `metodologias` | **SIMPLIFY** | Necessária, mas é configuração — não operação diária | Médio | Mover para área de configuração |
| Paper e versões | `metodologias` (7 rotas) | Documento da metodologia com validação | RN022 | **SIMPLIFY** | Continua sendo pré-requisito do Score Card | Alto | Preservar backend; reduzir exposição |
| `Ranking.tsx` | `pages/Ranking.tsx` (150 linhas) | Ranking e decisões | `metodologias` | **KEEP** | Responde "quais empresas têm maior potencial" | Baixo | Absorver no Dashboard novo |

---

## D. Fluxo operacional antigo (projeto → frente → parceria)

| Componente | Localização | Responsabilidade atual | Dependências | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Projetos | `modules/projetos` (16 rotas), `pages/Projetos.tsx`, `ProjetoDetalhe.tsx` (697 linhas) | Iniciativa do cliente | `frentes`, `metodologias` | **SIMPLIFY** | Semântica em aberto (SAD §3.1). Deixa de ser eixo obrigatório, mas ainda organiza o trabalho | **Alto** | **Não mexer antes de resolver a semântica** |
| Frentes de oportunidade | `modules/frentes` (11 rotas), `pages/Frentes.tsx` | Recorte território·setor | `projetos`, candidaturas | **SIMPLIFY** | Vira agrupamento de busca, não etapa de fluxo | Alto | Preservar dados; revisar exposição |
| Candidaturas | `modules/frentes` | Marca em avaliação | Score Card, decisões | **KEEP** | É a unidade de trabalho e o destino do Human Gate | Alto | Preservar |
| `Marcas.tsx` (mapa de oportunidades) | `pages/Marcas.tsx` (122 linhas) | Lista de marcas candidatas | `frentes` | **KEEP** | Ponto de entrada do Score Card | Baixo | Preservar |
| **`Funil.tsx`** | `pages/Funil.tsx` (379 linhas) | Funil comercial | Rota registrada, **sem link no menu** | **DEPRECATE** | Já órfã: nenhum ponto de entrada na interface. Funil comercial não é eixo do produto novo | Baixo | Manter rota; confirmar com a Cross se alguém usa por URL |
| Parcerias | `modules/parcerias` (15 rotas), `ParceriaDetalhe.tsx` | Parceria fechada, contratos, contrapartidas | RN026 | **HIDE** | Registro do que foi fechado tem valor histórico e alimenta a inteligência; gestão contratual detalhada não é o produto novo | Alto | Manter backend e dados; reduzir a leitura no perfil da parte |
| `Cronograma.tsx` | `pages/Cronograma.tsx` (204 linhas) | Cronograma de parcerias | `parcerias`, `execucao` | **HIDE** | Gestão operacional extensa sai da experiência principal | Médio | Retirar do menu; manter rota |
| `Resumo.tsx` | `pages/Resumo.tsx` (239 linhas) | Resumo executivo | mock + API | **HIDE** | Será substituído pelo Dashboard de inteligência | Médio | Retirar do menu após o Dashboard novo |

---

## E. Cauda operacional sem interface (o achado mais forte)

Estes módulos somam **58 rotas** e **zero referências** no frontend.

| Componente | Localização | Rotas | Dependências | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---:|---|---|---|---|---|
| Execução (planos, etapas, entregas, touchpoints, pendências) | `modules/execucao`, `cross_execution` | 26 | RN026; testes de backend | **DEPRECATE** | Nenhum consumidor de interface. "Execução detalhada", "entregas" e "pendências" estão na lista de áreas que saem da experiência principal | Médio | Manter rotas e dados; não evoluir. Reavaliar em 2 sprints |
| Resultados (indicadores, medições, ROI, encerramento) | `modules/resultados`, `cross_analytics` | 18 | RN034; testes | **DEPRECATE** | Mesma situação. "Analytics avançado", "ROI" e "encerramento" saem do núcleo | Médio | Manter; não evoluir |
| Reuniões (dentro de execução) | `modules/execucao` | 6 | `parcerias` | **SIMPLIFY** | **Exceção importante:** reuniões são componente 12 do novo núcleo e insumo da jornada B (Parceiro→Cliente). Hoje estão presas a `parceria_id` | Médio | **Repensar**: reunião precisa existir ligada a *parte*, não só a parceria |
| Governança (auditoria, evidências, fontes) | `modules/governanca` | 9 | `cross_governance`, RN037 | **KEEP** | Sem interface hoje, mas evidências e fontes são componente 11 e sustentam a confiabilidade da IA | Alto | Preservar; **criar** interface na fase de agentes |
| Documentos | `modules/documentos` | 5 | `cross_core` | **KEEP** | Sem interface, mas é componente 13 e fonte de RAG | Baixo | Preservar; ligar ao RAG |

> **Atenção ao classificar a cauda.** `execucao` e `resultados` são
> `DEPRECATE`, não `REMOVE_SAFE`: têm 44 rotas cobertas por testes de
> integração, dependem de regras de banco (RN026, RN034) e guardam schemas com
> dados. A ausência de interface prova que **não estão em uso pela equipe**, não
> que possam ser removidos sem consequência.

---

## F. Administração e plataforma

| Componente | Localização | Responsabilidade atual | Dependências | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Autenticação | `modules/auth`, `shared/security` | JWT, scrypt | Tudo | **KEEP** | Regra de segurança da refatoração | Alto | Não tocar |
| Autorização por persona | `shared/middleware/authz.ts` | Quais operações | Tudo | **KEEP** | Não tocar | Alto | Não tocar |
| Escopo por cliente | `shared/escopo.ts` | Quais contas | `usuario_pode_ver_cliente()` | **KEEP** | Não tocar | Alto | Não tocar |
| Usuários e acessos | `modules/admin` (7), `pages/Usuarios.tsx` | Equipe e escopo | `auth` | **KEEP** | Necessário | Médio | Preservar; agrupar em "Sistema" |
| Importar dados | `pages/ImportarDados.tsx` (331), agentes CSV | Carga assistida por IA | `agentes` | **KEEP** | Como a base de inteligência é alimentada | Médio | Preservar; aproximar da área de inteligência |
| Swagger (`modules/docs`) | `docs.routes.ts` | 1 rota | — | **KEEP** | Documentação da API | Baixo | Preservar |
| Auditoria imutável | migration `022`, RN037 | Trilha | `cross_governance` | **KEEP** | Regra de segurança | Alto | Não tocar |

---

## G. Débitos técnicos identificados

| Item | Localização | Classe | Justificativa | Risco | Ação recomendada |
|---|---|---|---|---|---|
| **Mock `PARCERIAS` em produção** | `pages/Partes.tsx:6,132`, `pages/ParteDetalhe.tsx:9` | **REMOVE_SAFE** | Contadores exibidos ao usuário vêm de array estático, não da API. Contradiz o SAD §5. Import isolado, substituível por chamada existente `GET /parcerias` | **Médio** | **Corrigir na Fase B** — é dado errado na tela, não estética |
| Reexport de mocks no store | `store/useStore.ts:14-15,944` | **DEPRECATE** | Reexportados para "lookups pontuais (histórico)"; mantidos por compatibilidade | Médio | Mapear consumidores antes de remover |
| `restaurarDemo()` no AppShell | `AppShell.tsx:423-428` | **HIDE** | Botão "Demo" restaura dados de demonstração numa plataforma com dados reais da Aramis | **Alto** | Esconder em produção — risco de acionamento acidental |
| Rodapé "dados reais" | `AppShell.tsx:492` | **SIMPLIFY** | Afirma "dados reais" enquanto há mock ativo | Baixo | Corrigir junto com o mock |
| `/funil` sem ponto de entrada | `App.tsx:75` | **DEPRECATE** | 379 linhas sem link | Baixo | Confirmar desuso antes de remover a rota |
| RLS ausente | 0 de N tabelas | **KEEP** (pendência) | Fora do escopo da Sprint 0, mas precisa entrar antes de acesso externo | Alto | Registrar; não executar agora |

---

## Resumo quantitativo

| Classe | Componentes | Rotas aproximadas | Páginas |
|---|---:|---:|---:|
| KEEP | 24 | ~125 | 9 |
| SIMPLIFY | 9 | ~50 | 5 |
| HIDE | 4 | ~15 | 3 |
| DEPRECATE | 6 | ~45 | 1 |
| REMOVE_SAFE | 1 | 0 | 0 (2 imports) |

**Leitura:** apenas **um** item recebeu `REMOVE_SAFE`, e é um débito técnico
(mock em produção), não uma funcionalidade. Isso é deliberado — a Sprint 0 pede
evidência antes de remoção, e a evidência disponível hoje sustenta *esconder* e
*parar de evoluir*, não *excluir*.

**Continua em:** `03-target-product-architecture.md`.
