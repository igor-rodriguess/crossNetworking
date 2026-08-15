# 12 — Cost Guardrails

**Plataforma Cross** · Sprint 0D
Data: 07/08/2026 · Status: **APPROVED**

> Registro técnico objetivo. O artefato principal de validação humana é
> [`validation/cost-guardrails-output-showcase.md`](validation/cost-guardrails-output-showcase.md),
> que mostra o comportamento real.

---

## 1. Arquivos

### Novos

| Arquivo | Papel |
|---|---|
| `backend/src/modules/agentes/shared/budget.ts` | Cost Budget Service — capacidade compartilhada |
| `backend/src/modules/agentes/shared/budget.test.ts` | Cenários A–L (24 testes) |
| `docs/ai/validation/cost-guardrails-output-showcase.md` | Showcase de comportamento |
| `docs/ai/validation/raw/cost-guardrails/scenarios.txt` | Saída bruta dos cenários |

### Alterados (produção)

| Arquivo | Alteração |
|---|---|
| `backend/src/config/env.ts` | 8 variáveis de guardrail; kill switch nos flags de mock |
| `backend/src/modules/agentes/shared/llm.ts` | Kill switch junto ao `fetch` |
| `backend/src/modules/agentes/shared/embeddings.ts` | Kill switch junto ao `fetch` |
| `backend/src/modules/agentes/shared/firecrawl.ts` | Kill switch em `extracaoEmModoMock()` |
| `backend/src/modules/agentes/shared/web-search.ts` | Kill switch no fallback Firecrawl |
| `backend/src/modules/agentes/agentes.service.ts` | Orçamento por execução; limites de ferramenta e candidatos; status |
| `backend/src/modules/agentes/agentes.schema.ts` | `budget_blocked`, `cost_unknown`, `cancelled` |

**Nenhuma migration.** Os guardrails operam em memória por execução; a telemetria
usa o JSONB de `execucao_agente.saida`, que já existe.

---

## 2. Configuração

| Variável | Default | Protege contra |
|---|---|---|
| `AI_PAID_PROVIDERS_ENABLED` | `false` | Gasto acidental — **kill switch** |
| `AI_STRICT_COST_MODE` | `true` | Modelo sem preço tratado como grátis |
| `AI_MAX_COST_PER_RUN_USD` | `0.5` | Execução cara demais |
| `AI_MAX_LLM_CALLS_PER_RUN` | `20` | Laço de inferência |
| `AI_MAX_WEB_SEARCHES_PER_RUN` | `12` | Cota de busca |
| `AI_MAX_SCRAPES_PER_RUN` | `15` | Firecrawl por página |
| `AI_MAX_REASONING_CANDIDATES` | `8` | Candidate explosion |
| `AI_MAX_RETRIES_PER_STEP` | `2` | Repetição custosa |

Validadas por Zod no schema existente (`config/env.ts`), seguindo a convenção do
projeto. Nenhum número mágico no código.

> **DEV DEFAULT ≠ PRODUCTION BUDGET.** Estes valores são conservadores para
> desenvolvimento. `AI_PAID_PROVIDERS_ENABLED=false` significa que hoje nenhuma
> chamada paga é possível sem ação deliberada. Os tetos de produção devem ser
> definidos junto da ativação do provider pago.

---

## 3. Decisões

**O guardrail é um só.** Regras de custo espalhadas por agente divergem com o
tempo e deixam brechas — a proteção passaria a valer só onde alguém lembrou de
aplicá-la. `OrcamentoExecucao` é instanciado por execução e compartilhado.

**Não conhece provider.** Recebe "vou gastar N tokens no modelo X" ou "vou
chamar a ferramenta Y". Trocar OpenAI por outro provedor não muda uma linha.

**Autorização e débito são separados.** `autorizarLlm()` estima antes;
`registrarConsumoLlm()` debita o real depois. O que se estima raramente é o que
se gasta.

**`null` nunca vira zero.** Custo não estimável é bloqueado em modo estrito.
Tratar "não sei quanto custa" como gratuito seria assinar cheque em branco.

**Kill switch em defesa de profundidade.** Cinco camadas independentes: config
(`env.ts`), cliente LLM, embeddings, Firecrawl/web-search e o próprio guardrail.
Se uma for contornada, as outras seguram.

**Bloqueio preserva o trabalho anterior.** Um candidato bloqueado retorna `null`
e é descartado; os já analisados seguem. As etapas anteriores permanecem
gravadas com seus custos e outputs.

**Corte de candidatos é determinístico.** Preserva a ordem de entrada: o
pré-filtro decide QUAIS, o guardrail decide QUANTOS. A proteção não depende de o
pré-filtro estar bom.

**Retry conservador.** Só erro temporário repete. O que não é reconhecido é
tratado como permanente. `budget_blocked` nunca repete — repetir gastaria de novo
exatamente o que se quis evitar.

---

## 4. Status de execução

| Status | Quando |
|---|---|
| `sucesso` | Execução completa |
| `insufficient_evidence` | Sem evidência suficiente (não é falha) |
| `budget_blocked` | Interrompida por limite de custo/ferramenta/switch |
| `cost_unknown` | Interrompida por custo não estimável |
| `cancelled` | Reservado para interrupção deliberada |

Proteção financeira **não** é erro técnico genérico.

---

## 5. Riscos e limitações

| # | Item | Situação |
|---|---|---|
| 1 | **Orçamento é por execução, não global** | Não há teto diário, mensal nem por cliente. Cem execuções de 0.5 USD custam 50 USD sem violar nenhum limite |
| 2 | **Estado em memória** | Um restart zera o acumulado da execução em curso. Aceitável enquanto o pipeline roda no processo da API |
| 3 | **Preços desatualizam** | `PRECOS_POR_MODELO` é referência de 2026-08. **Revisar antes de ativar provider pago** |
| 4 | **Estimativa por candidato é fixa** | 4.000/1.200 tokens no reasoning. Se o prompt crescer, a estimativa subestima — o débito real corrige depois, mas a autorização pode passar |
| 5 | **Ferramentas sem custo unitário** | `uso_ferramenta.custo_estimado` existe, mas Firecrawl/busca não têm preço cadastrado — contam chamadas, não dinheiro |
| 6 | **`cancelled` sem produtor** | Status declarado; nada o emite ainda |

**O item 1 é o mais relevante** para a próxima etapa: o guardrail impede uma
execução cara, não um mês caro.

---

## 6. Testes

24 testes em `budget.test.ts`, cobrindo os cenários A–L do briefing mais
contexto estruturado e observabilidade. **Suíte completa: 237/237.**

Nenhuma chamada real (paga ou gratuita) ocorre nos testes — o guardrail é
contabilidade em memória, exercitável offline.
