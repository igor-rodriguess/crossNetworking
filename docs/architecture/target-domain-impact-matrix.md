# Matriz de Impacto do Domínio Alvo

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Nenhuma alteração executada. Prioridade: reutilizar o modelo existente.

---

## 1. Matriz de banco (§27)

| Entidade | Estrutura atual | Problema | Alteração proposta | Migration? | Risco | Compatibilidade | Prioridade |
|---|---|---|---|---|---|---|---|
| **Parte / Empresa** | `cross_core.parte` + `parte_papel` | Nenhum — papéis com vigência já resolvem | Nenhuma | **Não** | — | — | — |
| **Cliente** | `cliente_cross.parte_id` | Nenhum — já pendura em Parte | Nenhuma | **Não** | — | — | — |
| **Entity Intelligence** | `cross_intelligence.*` | Nenhum estrutural | Nenhuma | **Não** | — | — | — |
| **Oportunidade** | `candidatura_parceiro` | Origem não registrada | `+ origem VARCHAR(30) DEFAULT 'manual'` | **Sim** | Baixo | Aditiva | **Alta** |
| **Oportunidade** | `frente_oportunidade.projeto_id NOT NULL` | Exige projeto e cliente | `DROP NOT NULL` | **Sim** | **Médio** | Relaxamento | **Alta** |
| **Oportunidade** | sem vínculo direto a cliente | Cliente só via projeto | `+ cliente_cross_id UUID` nullable | **Sim** | Baixo | Aditiva | **Alta** |
| **Funil** | `status_candidatura` (16) + `historico_candidatura` | Nenhum | Nenhuma | **Não** | — | — | — |
| **Projeto** | `cross_projects.projeto` | Semântica, não estrutura | Nenhuma (regra de serviço) | **Não** | — | — | Média |
| **Reunião** | `reuniao.parceria_id NOT NULL` | **Bloqueia jornada B** | Migration 055 (doc 03) | **Sim** | **Médio** | Retrocompatível | **Alta** |
| **Evidence** | `oportunidade_ia.fontes` (JSONB) | Sem entidade própria | Avaliar `cross_ai.evidencia` | **Sim** | Médio | Aditiva | Média |
| **Knowledge Reference** | `documento_rag.metadados` | Sem `section` nem versão | Usar `metadados` (JSONB) | **Não** | Baixo | — | Média |
| **Cross Knowledge** | `documento_rag` | Sem validação nem versão | `+ validado_por_id, validado_em, versao_metodologia` | **Sim** | Baixo | Aditiva | Média |
| **Crossability Analysis** | `analise_crossability` | Sem rastreio por dimensão | Avaliar `metadados` JSONB | Talvez | Baixo | Aditiva | Baixa |
| **Cross Score Card** | `modelo_/avaliacao_score_card` | Nenhum | Nenhuma | **Não** | — | — | — |
| **Agent Run** | `execucao_agente`, `tarefa_pipeline` | Colunas do hardening pendentes | **Migrations 053/054** | **Sim — prontas** | Baixo | Aditiva | **Crítica** |
| **Human Review** | `oportunidade_ia.status` + auditoria | Edição humana não registrada | Avaliar após Evidence | Talvez | Baixo | Aditiva | Baixa |
| **Documento** | `cross_core.documento` | Sem interface | Nenhuma | **Não** | — | — | Baixa |
| **Artista** | `parte` + `parte_papel` | Nenhum | Nenhuma | **Não** | — | — | — |
| **Big Moment** | — | Sem estrutura própria | Avaliar em `cross_intelligence` | **Sim** | Baixo | Aditiva | Baixa |
| **Cross Memory** | disperso (5 tabelas) | Nenhum — é conceito | **Nenhuma** — não criar tabela | **Não** | — | — | — |

### Consolidado

| | Quantidade |
|---|---:|
| Sem nenhuma alteração | **10** |
| Migration aditiva | 6 |
| Relaxamento de restrição | 2 |
| **Tabela nova** | **1** (Evidence, a avaliar) |
| Destrutiva | **0** |

**Dez das vinte entidades não exigem mudança alguma.** O modelo atual sustenta o
domínio alvo melhor do que a auditoria inicial sugeria.

---

## 2. Migrations em ordem

| # | Migration | Estado | Bloqueia |
|---|---|---|---|
| 053 | Observabilidade (`modelo`, `custo`, `execucao_pai_id`, `uso_ferramenta`) | **Criada, não aplicada** | Código do hardening |
| 054 | Checkpoint (`checkpoint`, `tentativa`, `retomada_de_id`) | **Criada, não aplicada** | Código do hardening |
| 055 | Reunião como evento de inteligência | **Proposta** (doc 03) | Jornada B |
| 056 | Oportunidade (origem, cliente direto, projeto opcional) | A escrever | Jornadas B e C |
| 057 | Cross Knowledge (validação, versão) | A escrever | Etapa de RAG |
| 058 | Evidence como entidade | A avaliar | Rastreabilidade fina |

**053 e 054 são pré-requisito de tudo** — o código do hardening já depende
delas.

---

## 3. Impacto no backend (§28)

### Módulos reaproveitados sem alteração

| Módulo | Rotas | Papel no alvo |
|---|---:|---|
| `partes` | 13 | Parte / Empresa |
| `clientes` | 13 | Cliente Cross |
| `inteligencia` | 38 | Entity Intelligence |
| `metodologias` | 26 | Crossability + Score Card |
| `auth` / `admin` / `docs` | 13 | Plataforma |
| `governanca` | 9 | Evidências (sem interface) |
| `documentos` | 5 | Knowledge (sem interface) |

**117 rotas reaproveitadas sem alteração.**

### Módulos que precisam evoluir

| Módulo | Rotas | Evolução | Depende de |
|---|---:|---|---|
| `frentes` | 11 | Candidatura vira Oportunidade; projeto opcional | 056 |
| `agentes` | 26 | Human Gate promove oportunidade; Verification→Crossability | 053/054 |
| `execucao` | 26 | **Reunião sai de DEPRECATE para KEEP** | 055 |
| `projetos` | 16 | Regra de conversão Oportunidade→Projeto | 056 |

### Módulos congelados

| Módulo | Rotas | Situação |
|---|---:|---|
| `resultados` | 18 | Sem consumidor; congelado (Sprint 0A) |
| `parcerias` | 15 | Vira histórico da Parte |
| `execucao` (exceto reunião) | 20 | Congelado |

### Rotas novas previstas

| Rota | Para quê | Depende de |
|---|---|---|
| `POST/GET /partes/:id/reunioes` | Reunião por Parte | 055 |
| `GET /oportunidades` (agregado) | Dashboard + funil | 056 |
| `GET /oportunidades/travadas` | Bloco de atenção | — |
| `POST /agentes/human-gate/oportunidade` | Promover rascunho a domínio | 056 |
| `GET /agentes/custo` | Consumo agregado | 053 |

### Deixam de ser centrais

`resultados` (ROI, indicadores, encerramento) · `execucao` exceto reunião ·
gestão contratual em `parcerias` · `projetos` como ponto de partida.

---

## 4. Impacto no frontend (§29)

### Mudança imediata — sem backend novo

| Mudança | Arquivo | Risco |
|---|---|---|
| Remover mocks de produção | `Partes.tsx`, `ParteDetalhe.tsx` | **Médio** — corrige número errado |
| Esconder botão "Demo" | `AppShell.tsx` | Baixo |
| Menu de 5 grupos | `AppShell.tsx` | Médio |
| Retirar `/cronograma`, `/resumo`, `/frentes` do menu | `AppShell.tsx` | Médio |
| Reintegrar `/clientes` | `AppShell.tsx` | Baixo |
| `/criterios` → Configurações | `AppShell.tsx` | Baixo |
| Dashboard com 7 blocos prontos | `Dashboard.tsx` | Médio |
| Absorver Ranking no Dashboard | `Dashboard.tsx` | Baixo |

**Oito mudanças sem tocar no backend.**

### Depende do novo domínio

| Mudança | Depende de |
|---|---|
| Funil dentro de Oportunidades | rota agregada |
| Bloco "oportunidades travadas" | rota nova |
| Página de Reuniões | 055 |
| Bloco de custo | 053 |
| Big Moments | estrutura nova |
| Oportunidade sem projeto | 056 |

### Páginas — destino

| Destino | Páginas |
|---|---|
| **Permanecem** | Dashboard (reescrito) · Oportunidades · Partes · ParteDetalhe · Clientes · Artistas · ScoreCard · Marcas · Conhecimento · Usuarios · ImportarDados · Login |
| **Absorvidas** | Ranking → Dashboard · Criterios → Configurações · Funil → Oportunidades |
| **Escondidas** | Cronograma · Resumo · Frentes · ParceriaDetalhe |
| **Condicionadas** | Projetos · ProjetoDetalhe (aguarda decisão de semântica) |
| **Novas** | Reunioes (futura) · Configuracoes |

**Nenhuma rota removida.**

---

## 5. Mudanças sem migration (§9 da saída)

Podem começar assim que esta arquitetura for aprovada:

| # | Mudança | Camada |
|---|---|---|
| 1 | Remover mocks de produção | Frontend |
| 2 | Esconder botão "Demo" | Frontend |
| 3 | Menu de 5 grupos | Frontend |
| 4 | Retirar páginas do menu | Frontend |
| 5 | Reintegrar `/clientes` | Frontend |
| 6 | Dashboard com 7 blocos prontos | Frontend |
| 7 | Regra "IA não move funil" | Backend (serviço) |
| 8 | Sugestão de IA em `historico_candidatura.contexto` | Backend |
| 9 | Regra de conversão Oportunidade→Projeto | Backend |
| 10 | Auditar escrita do `part-enrichment` | Backend |

---

## 6. Bloqueadores

| # | Bloqueador | Impede | Resolução |
|---|---|---|---|
| 1 | **Migrations 053/054 não aplicadas** | Código do hardening | Aplicar |
| 2 | **Suíte de integração não executada** | Confiança no hardening | Docker + `npm test` |
| 3 | Reunião presa a `parceria_id` | Jornada B | Migration 055 |
| 4 | Projeto obrigatório | Jornadas B e C | Migration 056 |
| 5 | Sem teto de gasto | Ligar chave paga | Guardrails |
| 6 | RAG insuficiente | "Jeito Cross de pensar" | Etapa de RAG |
| 7 | Semântica de "projeto" | Esconder `/projetos` | **Decisão humana** |
| 8 | `part-enrichment` sem Human Gate | Confiança na escrita | Auditoria |

**Os itens 1 e 2 são os mais urgentes** — bloqueiam a validação do trabalho já
feito.

O item 7 é o único que **nenhuma análise técnica resolve**.

---

## 7. Roadmap recomendado (§30)

A ordem do briefing está quase correta. Proponho **três ajustes**, justificados:

| # | Etapa | Ajuste |
|---|---|---|
| **0** | **Homologar hardening** (aplicar 053/054, rodar suíte) | — |
| **1** | **Guardrails de custo** | — |
| **2** | **Migration 055 + 056** (reunião e oportunidade) | ⬆️ **ANTECIPADO** |
| 3 | Cross Knowledge / RAG | era 2 |
| 4 | Research & Evidence | era 3 |
| 5 | Entity Intelligence | era 4 |
| 6 | Crossability Reasoning | era 5 |
| 7 | Internal Matching | era 6 |
| 8 | Recommendation | era 7 |
| 9 | Score Card / Human Gate | era 8 |
| 10 | Oportunidades + Funil | era 9 |
| **11** | **Poda visual do frontend** | ⬆️ **ANTECIPADO** (era 15) |
| 12 | Meeting Intelligence | era 10 |
| 13 | Parceiro → Cliente | era 11 |
| 14 | Prospecção do zero | era 12 |
| 15 | Artist / Big Moment | era 13 |
| 16 | Monitoring | era 14 |
| 17 | Frontend final | era 15 |
| 18 | Deploy / homologação | era 16 |

### Justificativa dos ajustes

**Ajuste 1 — Migrations de domínio antes do RAG.** As migrations 055 e 056 são
aditivas, de baixo risco e desbloqueiam duas jornadas. Fazê-las antes significa
que todo agente construído a partir dali já nasce sobre o domínio correto. Se
ficarem para depois, Research & Evidence e Entity Intelligence serão construídos
sobre o modelo antigo e precisarão de ajuste.

**Ajuste 2 — Poda visual antecipada (era 15 → 11).** Há um problema **hoje**:
mocks alimentam contadores em produção, exibindo números errados sobre a conta
Aramis. Isso não deveria esperar dezesseis etapas. As oito mudanças de frontend
sem backend podem ser feitas em paralelo, e a correção dos mocks é urgente.

**Ajuste 3 — Guardrails antes de tudo que consome.** Já estava na posição certa;
reforço que é pré-requisito absoluto de qualquer chave paga. Medir não é
limitar — o hardening tornou o consumo mensurável, mas nada o interrompe.

### Próxima tarefa de código após aprovação

**Aplicar as migrations 053 e 054 e rodar a suíte completa de 203 testes.**

Não é a tarefa mais interessante, mas é a única defensável: há código em `main`
que depende de colunas inexistentes no banco, e um conjunto de alterações no
`agentes.service.ts` que nunca foi exercitado por teste de integração.

Requer: PostgreSQL de teste (Docker), `npm run db:migrate:test`, `npm test`.
Critério: **203 testes passam sem alteração nos testes**.
