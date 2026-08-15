# 11 — Homologação do Agent Framework Hardening

**Plataforma Cross** · Sprint 0C
Data: 07/08/2026 · **Status: APPROVED_WITH_WARNINGS**

> Evidência de homologação. Nenhuma API paga conectada, RAG não alterado,
> Crossability não alterado, `agentes.service.ts` não refatorado, migrations
> 055/056 não implementadas, banco de produção não tocado.

---

## 1. Ambiente utilizado

**Bloqueador inicial:** não havia ambiente de teste. Docker indisponível, nenhum
PostgreSQL instalado, `TEST_DATABASE_URL` não definida — e `DATABASE_URL` no
`.env` aponta para **Supabase (produção)**.

**Resolução:** provisionei um cluster PostgreSQL **efêmero e isolado** no
scratchpad da sessão, sem instalar nada no sistema e sem tocar em produção.

| Item | Valor |
|---|---|
| PostgreSQL | **16.4** (binários portáteis, EnterpriseDB) |
| Local do cluster | `scratchpad/pgdata` (efêmero) |
| Host / porta | `localhost:5433` (`listen_addresses=localhost`) |
| Banco | `cross_test` |
| `TEST_DATABASE_URL` | `postgresql://postgres:***@localhost:5433/cross_test` |
| pgvector | **0.8.6** (build comunitário pg16) |
| Node | v22.14.0 · npm 11.16.0 |

### Confirmação de segurança

- ✅ `TEST_DATABASE_URL` aponta para `localhost:5433/cross_test`
- ✅ **`DATABASE_URL` de produção nunca foi exportada nesta sessão**
- ✅ Nenhuma migration executada contra Supabase
- ✅ Cluster escuta apenas em `localhost`
- ✅ Cluster é descartável — vive no scratchpad

> **`pgvector` foi necessário:** a migration 035 declara
> `CREATE EXTENSION vector`. Sem ela, o schema para na 035. Registro relevante
> para a infraestrutura: **qualquer ambiente de teste da Cross precisa de
> pgvector**, conforme já documentado em `ARQUITETURA_INFRAESTRUTURA`.

---

## 2. Migrations executadas

**56 migrations aplicadas** do zero, em ordem, sem erro.

```
Aplicando 053_observabilidade_execucao_agente.sql... OK
Aplicando 054_checkpoint_tarefa_pipeline.sql... OK
22 migration(s) aplicada(s) com sucesso.
```

**Reexecução (idempotência):**
```
Banco já está atualizado.
```

**Registro no ledger:**

| id | nome | checksum (início) |
|---:|---|---|
| 56 | `054_checkpoint_tarefa_pipeline.sql` | `a943d5c0…` |
| 55 | `053_observabilidade_execucao_agente.sql` | `d97607f0…` |

### Migration 053 — validação pós-aplicação: **PASS**

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `modelo` | `character varying` | YES | — |
| `tokens_cache` | `integer` | **NO** | `0` |
| `custo_estimado` | `numeric` | YES | — |
| `iniciado_em` | `timestamptz` | YES | — |
| `finalizado_em` | `timestamptz` | YES | — |
| `execucao_pai_id` | `uuid` | YES | — |
| `tentativa` | `smallint` | **NO** | `1` |

Tabela `cross_ai.uso_ferramenta` criada com 9 colunas (`id`, `execucao_id`,
`ferramenta`, `chamadas`, `unidades`, `falhas`, `custo_estimado`, `detalhe`,
`criado_em`).

FKs: `fk_execucao_agente_pai`, `fk_uso_ferramenta_execucao` ✅
Índices: `idx_execucao_agente_pai`, `idx_uso_ferramenta_execucao`,
`idx_uso_ferramenta_ferramenta` ✅

**Conferência das pré-condições:** apenas operações aditivas · nenhuma coluna
removida · nenhum tipo alterado · nenhum dado reescrito · rollback documentado
no cabeçalho do arquivo.

### Migration 054 — validação pós-aplicação: **PASS**

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `checkpoint` | `jsonb` | **NO** | `'{}'::jsonb` |
| `tentativa` | `smallint` | **NO** | `1` |
| `retomada_de_id` | `uuid` | YES | — |

FK `fk_tarefa_pipeline_retomada` ✅

**Registros antigos continuam legíveis:** as colunas têm default, então linhas
pré-existentes ficam com `checkpoint = {}` e `tentativa = 1` — leitura correta
de "nunca teve checkpoint" e "primeira tentativa".

---

## 3. Suíte de testes

```
 Test Files  23 passed (23)
      Tests  214 passed (214)
   Duration  32.92s
```

| Conjunto | Testes |
|---|---:|
| Suíte original | **203** |
| Testes de custo (hardening) | 5 |
| Testes de homologação (esta sprint) | 6 |
| **Total** | **214 · todos passando** |

**Zero regressões. Nenhum teste existente foi modificado.**

Execução intermediária, antes de acrescentar os testes de homologação:
`208 passed (208)` — confirma que os 203 originais passam com o código do
hardening e as migrations aplicadas.

---

## 4. Typecheck

```
npm run typecheck  →  0 erros
```

**PASS.**

---

## 5. Auditoria de produção

```
npm audit --omit=dev --audit-level=high

ip-address  <=10.3.0
Severity: high
  · GHSA-mwp4-54f8-5fhr — octetos com zero à esquerda (SSRF)
  · GHSA-4xrf-jv44-h6hh — sufixo CIDR suprime classificação de uso especial
  · GHSA-22jq-vg5j-6vgg — IPv4-mapped/NAT64 mal classificados

1 high severity vulnerability
```

### Análise

| Pergunta | Resposta |
|---|---|
| Causada pelo hardening? | **Não** |
| É dependência direta? | **Não** — transitiva |
| Cadeia | `express-rate-limit@8.5.2 → ip-address@10.2.0` |
| `package.json` alterado no hardening? | **Não** (`git diff` vazio) |

**Classificação: PROBLEMA PRÉ-EXISTENTE**, fora do escopo desta sprint
(instrução 6). Não corrigido.

> **Recomendação para a próxima sprint:** as três CVEs são de bypass de SSRF em
> parsing de IP. O `express-rate-limit` usa `ip-address` para normalizar o IP do
> cliente — e a aplicação roda com `TRUST_PROXY=true` atrás de Cloudflare/Render.
> Vale avaliar `npm audit fix` e rodar a suíte. **Não é bloqueador desta
> homologação**, mas também não deveria ficar parado.

---

## 6. Evidência de telemetria — **PASS**

Registro real produzido no banco de teste (transação revertida ao final):

```
=== EXECUCAO PAI + FILHA ===
 nivel |        agente         |  origem  |   modelo    | tokens_entrada | tokens_saida | tokens_cache | duracao_ms | custo_estimado | tentativa |  inicio  |   fim
-------+-----------------------+----------+-------------+----------------+--------------+--------------+------------+----------------+-----------+----------+----------
 PAI   | partner_discovery     | pipeline |             |        1000000 |      1000000 |       200000 |       4000 |       0.735000 |         1 | 18:25:09 | 18:25:13
 FILHA | information_extractor | openai   | gpt-4o-mini |        1000000 |      1000000 |       200000 |       1500 |       0.735000 |         1 | 18:25:09 | 18:25:11

=== USO DE FERRAMENTA ===
    ferramenta    | chamadas | unidades | falhas
------------------+----------+----------+--------
 firecrawl_scrape |        3 |        3 |      0
```

**O que isto comprova:**

| Item exigido | Comprovado |
|---|---|
| Execução pai | ✅ `partner_discovery`, `origem=pipeline` |
| Execução filha | ✅ vinculada por `execucao_pai_id` |
| Provider | ✅ `openai` |
| Model | ✅ `gpt-4o-mini` (distinto do provider) |
| input_tokens | ✅ 1.000.000 |
| output_tokens | ✅ 1.000.000 |
| cached_tokens | ✅ 200.000 |
| Duração | ✅ 1500 ms (filha) · 4000 ms (pai) |
| custo_estimado | ✅ **0.735000 USD** |
| Tentativa | ✅ 1 |
| Timestamps | ✅ `iniciado_em` e `finalizado_em` |
| Uso de ferramenta | ✅ 3 chamadas de `firecrawl_scrape` |

**Conferência do cálculo de custo** (`gpt-4o-mini`: 0.15 entrada / 0.60 saída /
0.075 cache, por 1M):

```
800.000 entrada plena × 0.15/1M  = 0.120
200.000 cache        × 0.075/1M  = 0.015
1.000.000 saída      × 0.60/1M   = 0.600
                                   ─────
                                   0.735 USD  ✓
```

O cache foi **descontado da entrada**, não somado — confirmando que o mesmo
token não é cobrado duas vezes.

**Consolidação no pai** (teste automatizado): duas filhas de 0.15 cada somam
`0.30` no pai, via `SUM` em SQL. E quando nenhuma filha é estimável, o pai
mantém `custo_estimado = NULL` — preservando a distinção **"não medido" ≠
"custou zero"**.

---

## 7. Evidência do Fact Verifier — **PASS**

Cenário controlado com os três desfechos:

| # | Afirmação | Fontes | Domínios | Resultado |
|---|---|---|---:|---|
| A | "A marca X lançou uma collab de moda masculina." | `g1.globo.com`, `exame.com` | 2 | **`corroborada`** |
| B | "A marca X abriu uma loja em São Paulo." | `exame.com/a`, `www.exame.com/b` | 1 | **`fonte_unica`** |
| C | "A marca X pretende expandir para o Nordeste." | `""` | 0 | **`nao_confirmada`** |

```
resumo: { corroborada: 1, fonte_unica: 1, nao_confirmada: 1 }
```

**Detalhe relevante do cenário B:** duas URLs diferentes do **mesmo domínio**
(`exame.com` e `www.exame.com`) contam como **uma** fonte independente — o
`www.` é normalizado. Isso confirma que a corroboração exige independência real,
não apenas contagem de links.

**Nada foi alterado no Crossability** com base neste resultado, conforme a
instrução 8.

---

## 8. Evidência de checkpoint — **PASS**

Cenário: Planning → Collect → Credibility concluídas, falha posterior, retomada.

| Verificação | Resultado |
|---|---|
| Checkpoint nasce vazio | ✅ `{}` |
| Três etapas gravadas coexistem | ✅ `["search_planning","source_collector","source_credibility"]` |
| Merge no servidor não sobrescreve anteriores | ✅ (`jsonb ||` com `jsonb_build_object`) |
| Saída preservada fielmente | ✅ `total_resultados: 12` |
| Origem preservada | ✅ `heuristica` / `duckduckgo` |
| **Etapa em checkpoint não reexecuta** | ✅ flag `executou` permaneceu `false` |
| Valor vem do checkpoint, não de nova execução | ✅ `12`, não `999` |

**O que isto comprova:** uma etapa concluída **não roda de novo** quando a tarefa
é retomada. Como a etapa não roda, **nenhuma ferramenta externa dela é acionada
novamente** — logo, não é recobrada. É exatamente o comportamento pedido.

**Limite declarado:** checkpoint existe apenas para `search_planning`,
`source_collector` e `source_credibility`. Extraction e Reasoning — as etapas
caras — **ainda não têm**, conforme a instrução 9 (não implementar agora).

**Falta ainda o gatilho de retomada:** a infraestrutura grava e relê o
checkpoint, mas não há rota que dispare a retomada de uma tarefa com erro. Gap
conhecido, registrado no documento 10.

---

## 9. Auditoria de `shared/custo.ts`

Conforme instrução 10 — **sem conectar API externa para buscar preços**.

### Lógica matemática: **validada**

| Comportamento | Verificação |
|---|---|
| Entrada × preço + saída × preço | ✅ 1M+1M em `gpt-4o-mini` = 0.75 |
| Cache descontado da entrada | ✅ não cobra duas vezes |
| Cache > entrada não gera crédito negativo | ✅ `Math.min` + resultado ≥ 0 |
| Arredondamento em 6 casas | ✅ mesmo grão de `NUMERIC(12,6)` |
| Modelo desconhecido → `null` | ✅ **não vira 0** |
| Modelo local → `0` | ✅ `qwen3:4b` = 0 |
| Insensível a caixa/espaços | ✅ `"  GPT-4o-Mini "` = 0.15 |

### Modelos atualmente cadastrados (5)

| Modelo | Entrada | Saída | Cache |
|---|---:|---:|---:|
| `gpt-4o-mini` | 0.15 | 0.60 | 0.075 |
| `gpt-4o` | 2.50 | 10.00 | 1.25 |
| `deepseek-chat` | 0.27 | 1.10 | 0.07 |
| `text-embedding-3-small` | 0.02 | 0 | — |
| `text-embedding-3-large` | 0.13 | 0 | — |

Prefixos locais (custo 0): `qwen`, `llama`, `mistral`, `phi`, `gemma`,
`deepseek-r1`.

> ⚠️ **Os preços NÃO foram tratados como verdade absoluta.** São referência
> conferida em 2026-08 e desatualizam. Conforme combinado, a atualização será
> feita **imediatamente antes** de ativar providers pagos.

---

## 10. Falhas encontradas e correções

| # | Falha | Classificação | Correção |
|---|---|---|---|
| 1 | Ambiente de teste inexistente | **PROBLEMA DE AMBIENTE** | Cluster efêmero provisionado |
| 2 | pgvector ausente (migration 035 falha) | **PROBLEMA DE AMBIENTE** | pgvector 0.8.6 instalado no cluster |
| 3 | `ip-address` com CVE alta | **PROBLEMA PRÉ-EXISTENTE** | **Não corrigido** — fora de escopo |

**Regressões do hardening: ZERO.**

**Nenhum teste existente foi modificado.** Nenhuma correção de código foi
necessária: as 203 asserções originais passaram na primeira execução com o
código do hardening e as migrations aplicadas.

### Alterações realizadas nesta sprint

Apenas **um arquivo novo**, de teste:

```
backend/src/modules/agentes/homologacao-hardening.test.ts   (6 testes)
```

Nenhum arquivo de código de produção foi tocado.

---

## 11. Critérios de aprovação

| Critério | Situação |
|---|---|
| Migrations aplicadas em teste | ✅ 053 e 054 |
| Suíte completa passando | ✅ 214/214 (203 originais + 11) |
| Typecheck limpo | ✅ 0 erros |
| Telemetria persistindo | ✅ evidência real |
| Fact Verifier funcionando | ✅ 3 desfechos |
| Checkpoint funcionando | ✅ retomada sem reexecução |
| Nenhum comportamento antigo quebrado | ✅ zero regressões |

**Todos os sete critérios mínimos atendidos.**

---

## 12. Status final: **APPROVED_WITH_WARNINGS**

Não é `APPROVED` puro por duas ressalvas — **nenhuma delas causada pelo
hardening**, e nenhuma bloqueante:

**Warning 1 — CVE alta pré-existente em `ip-address`.** Transitiva de
`express-rate-limit`. Não introduzida pelo hardening, mas presente na árvore de
produção. Merece decisão na próxima sprint.

**Warning 2 — Homologação em cluster efêmero, não no ambiente oficial.** O
PostgreSQL usado é 16.4 local com pgvector 0.8.6; a produção é Supabase
(PostgreSQL 16 + pgvector). São compatíveis, mas **as migrations 053 e 054 ainda
não foram aplicadas em staging nem em produção** — esta homologação valida que
elas são seguras, não que já estão lá.

### Consequência prática

O hardening está **tecnicamente homologado**. Para colocá-lo em uso é preciso,
como passo separado:

```bash
npm run db:status     # conferir pendentes
npm run db:migrate    # aplicar 053 e 054 em staging, depois produção
```

**Ordem obrigatória:** migrations **antes** do deploy do código — o código já
nomeia as colunas novas.
