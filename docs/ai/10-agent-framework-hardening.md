# 10 — Hardening do Cross Agent Framework (Etapa 1)

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Objetivo: deixar o pipeline **seguro para receber APIs pagas**. Nenhuma chave
> foi conectada, `agentes.service.ts` não foi refatorado, a lógica de negócio do
> Crossability não foi alterada e nenhuma migration destrutiva foi criada.

---

## 1. Resumo das alterações

| # | Alteração | Arquivos |
|---|---|---|
| 1 | Telemetria completa em `auditarAgente()` | `agentes.service.ts`, `agentes.repository.ts` |
| 2 | Modelo e tokens de cache expostos pelo cliente LLM | `shared/llm.ts` |
| 3 | Estimativa de custo (módulo puro + testes) | `shared/custo.ts`, `shared/custo.test.ts` |
| 4 | Vínculo execução-pai ↔ etapas | `agentes.service.ts`, `agentes.repository.ts`, migration 053 |
| 5 | Registro de uso de ferramenta externa | `agentes.repository.ts`, migration 053 |
| 6 | **Fact Verifier integrado ao pipeline real** | `agentes.service.ts` |
| 7 | Proveniência da fonte (`publicado_em`, `coletado_em`) | `shared/web-search.ts`, `agentes.schema.ts` |
| 8 | Checkpoint por etapa | `agentes.service.ts`, `agentes.repository.ts`, migration 054 |

**Arquivos novos:** `shared/custo.ts`, `shared/custo.test.ts`, migrations 053 e 054.
**Arquivos modificados:** 8. **Arquivos removidos:** nenhum.

---

## 2. Alteração 1 — Telemetria em `auditarAgente()`

### Comportamento anterior

```ts
async function auditarAgente(input: AuditoriaAgenteInput): Promise<string> {
  return withTransaction((client) =>
    repo.registrarExecucao(client, {
      ...
      duracaoMs: undefined,   // ← sempre
      // tokensEntrada/tokensSaida nem eram passados → default 0
    })
  );
}
```

`AuditoriaAgenteInput` não tinha campos de token. As nove chamadas dentro de
`executarPipeline()` gravavam `tokens_entrada = 0`, `tokens_saida = 0`,
`duracao_ms = NULL` — **mesmo com provedor real**. O `llm.ts` já capturava os
tokens corretamente; o pipeline os descartava.

### Comportamento novo

`AuditoriaAgenteInput` recebeu `modelo`, `tokens`, `iniciadoEm`,
`execucaoPaiId`, `tentativa` e `ferramentas`. A função:

- calcula `duracao_ms` a partir de `iniciadoEm` e do instante da gravação
- grava `tokens_entrada`, `tokens_saida`, `tokens_cache`
- grava `modelo` e `custo_estimado` (via `estimarCusto`)
- grava `iniciado_em` / `finalizado_em`
- vincula à execução-pai
- registra uso de ferramenta **na mesma transação** da execução

> Decisão: uso de ferramenta grava junto com a execução. Se a execução não for
> registrada, seu consumo não deve ficar órfão.

---

## 3. Alteração 2 — Modelo e cache no cliente LLM

`ResultadoLLM` ganhou `modelo` e `tokens.cache`.

`origem` guardava só o provedor (`openai`, `ollama`). **Preço é por modelo**, não
por provedor — sem `modelo`, não há como estimar custo. A leitura de cache cobre
os dois formatos observados:

```ts
cache: json.usage?.prompt_tokens_details?.cached_tokens   // OpenAI
    ?? json.usage?.prompt_cache_hit_tokens                 // DeepSeek
    ?? 0,
```

Os agentes que repassam resultado de LLM (`search-planning`,
`crossability-reasoning`, `information-extractor`) propagam `modelo`.

---

## 4. Alteração 3 — Estimativa de custo

Módulo novo `shared/custo.ts`, aritmética pura, sem rede.

**Três decisões que os testes travam:**

1. **`null` ≠ `0`.** Modelo desconhecido devolve `null` (não estimado). Retornar
   0 esconderia gasto real.
2. **Modelo local custa 0.** `qwen`, `llama`, `mistral`… consomem tokens, mas a
   máquina já está paga.
3. **Cache não é cobrado duas vezes.** Provedores reportam cache *dentro* de
   `prompt_tokens`; somar os dois contaria a mesma entrada duas vezes.

> ⚠️ A tabela `PRECOS_POR_MODELO` é **referência conferida em 2026-08** e
> desatualiza. **Revisar antes de ligar qualquer chave paga.** Enquanto não
> houver tabela de preços no banco, é a fonte única.

---

## 5. Alteração 4 — Vínculo pai ↔ etapas

### Antes

O registro-pai era criado **no fim** do pipeline. Não havia coluna ligando as
etapas a ele: o vínculo existia só no JSONB `tarefa_pipeline.etapas`. Somar
custo por pipeline exigia varrer JSONB. No `catch`, um pai **novo** era criado —
as etapas concluídas ficavam órfãs de qualquer execução com status de falha.

### Agora

O pai é criado **antes** das etapas, com `saida: { status: "executando" }`. Cada
etapa nasce com `execucao_pai_id` preenchido. No fim (sucesso ou erro), o mesmo
pai é **fechado** por `finalizarExecucaoPai()`, que soma os totais das filhas em
SQL:

```sql
SET tokens_entrada = COALESCE(filhas.tokens_entrada, 0),
    custo_estimado = filhas.custo_estimado   -- NULL se nenhuma filha estimável
```

A soma vem do banco, não de um acumulador em memória que se perderia num
restart. `custo_estimado` permanece `NULL` quando nenhuma etapa foi estimável —
preservando a distinção "não medido" vs. "custou zero".

Agora é possível: `SELECT * FROM cross_ai.execucao_agente WHERE execucao_pai_id = $1`.

---

## 6. Alteração 6 — Fact Verifier integrado

**A correção mais importante desta etapa.**

### Antes

```ts
if (input.afirmacoes?.length) { ... } else {
  etapas.push({ nome: "fact_verifier", status: "ignorada",
    observacao: "Nenhuma afirmação foi fornecida pelo chamador." });
}
```

A etapa só rodava se o **chamador** enviasse afirmações — o que nunca acontece
numa execução automática. **Em todo pipeline real, a verificação era pulada**, e
nenhum fato chegava verificado ao Crossability.

Além disso, ela rodava **antes** da extração: mesmo recebendo afirmações, não
teria como verificar o que ainda não havia sido extraído.

### Agora

A etapa foi **movida para depois da extração** e alimentada por
`afirmacoesDosPerfis()`, que deriva afirmações verificáveis dos perfis
extraídos:

```
"<marca> atua no setor: <setor>"
"<marca> tem como público: <público>"
"<marca> atua nos territórios: <território>"
"<marca> dispõe dos ativos: <ativo>"
"<marca> apresenta sinais de parceria: <sinal>"
```

Cada afirmação carrega as URLs que a extração registrou como evidência daquele
perfil (ou, na ausência delas, as URLs da coleta). O Fact Verifier então conta
**domínios distintos** e classifica em `corroborada` / `fonte_unica` /
`nao_confirmada`.

A observação da etapa passa a mostrar o resultado:
`"12 corroborada(s), 8 de fonte única, 3 não confirmada(s)."`

### O que deliberadamente NÃO foi feito

**A verificação anota, não descarta.** Nenhum perfil é eliminado por ter
afirmação não corroborada. Motivo: descartar aqui **alteraria a lógica de
negócio do Crossability**, explicitamente fora do escopo desta etapa. O reasoning
já trata evidência fraca de forma conservadora (teto de confiança de 58 com fonte
única, 75 com duas ou mais).

**Consequência honesta:** o pipeline agora *verifica* os fatos e *registra* o
resultado, mas o Crossability ainda não *consome* esse resultado para modular
suas dimensões. Fechar esse elo é decisão de produto — está listado nos gaps.

Teto defensivo de 60 afirmações por execução, para não inflar o JSONB.

---

## 7. Alteração 7 — Proveniência da fonte

`ResultadoBusca` e `resultadoBuscaSchema` ganharam:

| Campo | Origem |
|---|---|
| `publicado_em` | Firecrawl (`publishedDate`, `metadata.publishedTime`); **`null` no DuckDuckGo** |
| `coletado_em` | Sempre preenchido — nós conhecemos o instante |

Ambos opcionais e nullable: `null` significa **"não foi possível determinar"**,
distinto de "sem data". `dataIso()` normaliza para ISO-8601 e devolve `null`
quando a string não é interpretável.

**Limitação registrada:** o endpoint HTML do DuckDuckGo — provedor primário
hoje — **não expõe data de publicação**. Enquanto ele for a fonte principal,
`publicado_em` será `null` na maioria dos resultados. Isso afeta diretamente a
dimensão *momento estratégico* da Crossability, que não tem como distinguir uma
notícia de 2019 de uma de 2026. Resolver exige promover o Firecrawl a provedor
primário (requer chave) ou extrair a data do conteúdo da página.

`source_url` e `source_name` já existiam como `url` e `fonte`.

---

## 8. Alteração 8 — Checkpoint por etapa

Contrato mínimo, sem fila e sem processo separado:

```ts
export interface Checkpoint {
  ler<T>(etapa: string): EtapaCheckpoint<T> | undefined;
  gravar(etapa: string, dados: EtapaCheckpoint): Promise<void>;
  tentativa?: number;
}
```

O pipeline envolve cada etapa em `comCheckpoint(nome, executar)`. Se houver
resultado salvo, a etapa **não roda** — nem refaz a chamada externa, nem
recobra. A etapa aparece como `sucesso` com a observação *"Retomada do
checkpoint — etapa não foi reexecutada."*

Persistência: coluna `checkpoint` (JSONB) em `tarefa_pipeline`, gravada com
`jsonb_set`/merge **no servidor** — duas etapas que terminem próximas não se
sobrescrevem.

**Etapas com checkpoint hoje:** `search_planning`, `source_collector`,
`source_credibility`. São as três primeiras e determinísticas — as mais seguras
de retomar. Extração e reasoning **ainda não** têm checkpoint (ver gaps).

Falhar ao gravar checkpoint **não derruba** a execução: perde-se a retomada
daquela etapa, não o resultado em andamento.

> Ainda **não existe** rota para retomar uma tarefa. A infraestrutura está
> pronta (checkpoint gravado e lido); falta o gatilho. Ver gaps.

---

## 9. Migrations

**Ambas foram criadas mas NÃO executadas** — não há banco disponível neste
ambiente, e a instrução pedia confirmação de segurança antes de aplicar.

### 053 — `053_observabilidade_execucao_agente.sql`

Colunas aditivas em `execucao_agente`: `modelo`, `tokens_cache`,
`custo_estimado`, `iniciado_em`, `finalizado_em`, `execucao_pai_id`,
`tentativa`. FK auto-referente + índice parcial. Tabela nova `uso_ferramenta`.

### 054 — `054_checkpoint_tarefa_pipeline.sql`

Colunas aditivas em `tarefa_pipeline`: `checkpoint`, `tentativa`,
`retomada_de_id`.

### Compatibilidade

| Aspecto | Situação |
|---|---|
| Colunas removidas/renomeadas | **Nenhuma** |
| Tipos alterados | **Nenhum** |
| Dados reescritos | **Nenhum** |
| Idempotente | Sim (`IF NOT EXISTS`, guarda por `pg_constraint`) |
| Código antigo continua funcionando | **Sim** — colunas novas são nullable ou têm default |
| Pode ser aplicada antes do deploy | **Sim** (ordem recomendada em `ARQUITETURA_INFRAESTRUTURA` §4.7) |
| Linhas antigas | Ficam com `NULL` — leitura correta de "não medido" |

### Rollback

Documentado no cabeçalho de cada arquivo. Descarta apenas telemetria e a
capacidade de retomada — **nenhum dado de domínio, oportunidade, análise,
auditoria de governança ou regra de negócio é afetado**.

### ⚠️ Ordem obrigatória

O código novo **depende** das colunas: `registrarExecucao()` nomeia
`tokens_cache`, `modelo`, `execucao_pai_id` etc. **Aplicar 053 e 054 ANTES de
subir o código**, ou os INSERTs falharão com `column does not exist`.

---

## 10. Testes

### Executados

Consegui instalar um runtime Node (v22.14.0) neste ambiente — o `node.exe`
faltava na instalação portátil.

| Verificação | Comando | Resultado |
|---|---|---|
| Typecheck do backend | `npm run typecheck` | ✅ **sem erros** |
| Testes de lógica pura | `vitest run` (7 arquivos) | ✅ **33 passaram** |

Os 33 incluem os **5 casos novos** de `custo.test.ts` e os 28 pré-existentes de
credibilidade, recomendação, crossability, qualificação, planejamento de
descoberta, extração e funil histórico.

### NÃO executados — e por quê

**A suíte completa (203 testes) não foi executada.** Ela exige
`TEST_DATABASE_URL` e um PostgreSQL de teste; **Docker não está disponível**
nesta máquina. A suíte se recusa a rodar sem banco — proteção deliberada, que
funcionou como esperado.

Para rodar os testes de lógica pura sem banco, usei uma config temporária
(`vitest.tmp-puro.config.ts`) que omite `setupFiles`. **Ela foi removida ao
final** — o `git status` confirma que não ficou no repositório.

**Não declaro sucesso da suíte completa.** Os testes de integração — que cobrem
os caminhos alterados em `agentes.service.ts` e `agentes.repository.ts` —
**ainda não foram exercitados**.

### Comandos a executar em ambiente com banco

```bash
# 1. Aplicar as migrations no banco de teste
cd backend
docker compose up -d db-test
npm run db:migrate:test

# 2. Suíte completa (203 testes)
npm test

# 3. Verificações complementares
npm run typecheck
npm run audit:prod

# 4. Migrations em staging, antes de produção
npm run db:status          # confere pendentes
npm run db:migrate         # aplica 053 e 054
```

**Critério de aceite:** os 203 testes passam **sem alteração nos testes**. Se
algum precisar mudar, o comportamento mudou e a alteração deve ser revista.

---

## 11. Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| 1 | Migrations não aplicadas antes do código → `column does not exist` | **Alta** | Ordem documentada em §9; aplicar 053/054 primeiro |
| 2 | Suíte de integração não exercitada | **Alta** | Rodar `npm test` com banco antes do merge |
| 3 | Tabela de preços desatualiza silenciosamente | **Média** | Aviso no código; revisar antes de ligar chave |
| 4 | Checkpoint com entrada diferente | **Média** | Hoje o checkpoint é por tarefa, e a tarefa guarda sua entrada — não há reuso entre entradas distintas. Ainda assim, não há validação de hash da entrada |
| 5 | Volume do JSONB de checkpoint | Baixa | Coleta e extração podem gerar payload grande; sem limite hoje |
| 6 | Pai fica `executando` se o processo morrer | Baixa | `recuperarTarefasInterrompidas()` já trata a tarefa; o pai não |
| 7 | 60 afirmações podem inflar auditoria | Baixa | Teto já aplicado |

---

## 12. Gaps remanescentes

### Antes de conectar a OpenAI

| # | Gap | Por quê importa |
|---|---|---|
| 1 | **Aplicar migrations 053 e 054** | O código depende delas |
| 2 | **Rodar a suíte completa** | Caminhos alterados não exercitados |
| 3 | **Revisar `PRECOS_POR_MODELO`** | Preço errado = custo errado |
| 4 | **Sem teto de gasto** | Não há limite por execução, dia ou cliente. Um pipeline com muitos candidatos pode gastar sem freio |
| 5 | **Sem retry** | `tentativa` é registrada, mas não há política de repetição |

O item 4 é o mais relevante: **medir não é o mesmo que limitar**. Esta etapa
tornou o consumo mensurável; ainda não existe nada que o interrompa.

### Depois

| # | Gap |
|---|---|
| 6 | Checkpoint em extração e reasoning (as etapas mais caras) |
| 7 | Rota para retomar tarefa a partir do checkpoint |
| 8 | Crossability consumir o resultado da verificação |
| 9 | `publicado_em` real (depende do Firecrawl primário) |
| 10 | Rastreio dimensão → fonte específica |
| 11 | Fato como entidade de primeira classe |
| 12 | RAG (**próxima etapa, por decisão**) |

---

## 13. O que NÃO foi tocado

Conforme as restrições:

- ❌ OpenAI não conectada; nenhuma chave inserida
- ❌ `agentes.service.ts` não refatorado (só as alterações pontuais descritas)
- ❌ Lógica de negócio do Crossability inalterada — as seis dimensões, os
  cálculos de confiança e `scoreFitDaAnalise()` estão idênticos
- ❌ RAG não alterado
- ❌ Nenhuma migration destrutiva; nenhum dado removido
- ❌ Human Gate, autenticação, autorização e auditoria intocados
