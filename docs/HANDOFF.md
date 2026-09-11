# HANDOFF — Contexto completo da Plataforma Cross

**Gerado em:** 11/09/2026
**Branch:** `melhorias/qualidade-e-seguranca` (sincronizada com o GitHub em `454528f`)
**Destino:** migração para máquina nova

Este documento reúne o que não está óbvio no código: decisões tomadas, motivos,
armadilhas encontradas e o que está bloqueado. O que dá para ler no repositório
(estrutura de pastas, rotas, schema) fica de fora de propósito.

---

## 1. Estado atual em números

Verificados no disco em 11/09/2026:

| Item | Valor |
|---|---|
| Testes backend | **642 passando** (43 arquivos) |
| Typecheck backend | limpo |
| Typecheck + build frontend | limpo |
| Migrations | 67 arquivos (numeradas até **065**) |
| Docs de IA | `docs/ai/01` a `docs/ai/22` |
| Commits à frente de `main` | 27 |

> **Atenção:** os números do `docs/SAD.md` estão **defasados** (cita 54 migrations,
> 203 testes, 13 agentes e não menciona o Orchestrator). Atualizar o SAD é uma
> tarefa pendente, não uma divergência de fato.

### Numeração de migrations

Há **duplicação histórica** de número — não é erro a corrigir sem cuidado:

```
041_agente_importacao_funil_historico.sql   041_rag_relatorios.sql
042_agente_enriquecimento_partes.sql        042_tarefa_pipeline.sql
```

Por isso 67 arquivos chegam só até o número 065. **A próxima migration é a 066.**

---

## 2. Ambiente — o que NÃO vem com o clone

Três coisas críticas vivem fora do repositório. Um clone limpo não as traz:

### 2.1 Node portátil

```
C:\Users\<user>\AppData\Local\node-portable\node-v24.18.0-win-x64\node.exe
```

Fora do repo. Na máquina nova, instale Node normalmente — o portátil era
contorno de restrição de instalação da Inteli, não exigência do projeto.

O `package.json` **não declara `engines`**, então não há versão travada. Esta
máquina rodou os 642 testes com **Node 22.14** (e o portátil era 24.18); o CI
e o SAD assumem Node 22. Use 22 LTS salvo motivo para o contrário.

### 2.2 PostgreSQL de teste — **efêmero**

O Postgres 16.4 + pgvector usado nos testes está num diretório de scratchpad
temporário, na porta **5433**, base `cross_test`. **Ele não sobrevive à
migração.**

Na máquina nova, a via normal é Docker:

```bash
docker compose up -d db-test          # porta 5433, efêmero
cd backend
npm run db:migrate:test
npm test
```

Docker **não estava instalado** nesta máquina — foi por isso que se recorreu ao
Postgres portátil. Com Docker, o caminho é o documentado no SAD §8.

### 2.3 Ollama

Rodando em `localhost:11434` com o modelo `qwen3:4b` (2,33 GB). Precisa ser
instalado e o modelo baixado de novo:

```bash
ollama pull qwen3:4b
```

---

## 3. Variáveis de ambiente que importam

`backend/.env` (ignorado pelo git — **não vem no clone**). Estado atual:

```
AI_PROVIDER=ollama
AI_MOCK=false
OLLAMA_MODEL=qwen3:4b
OPENAI_API_KEY=            ← VAZIA
DEEPSEEK_API_KEY=          ← VAZIA
FIRECRAWL_API_KEY=<presente, 35 chars>
AI_PAID_PROVIDERS_ENABLED  ← não definido (= false)
```

### O kill switch e a allowlist são coisas diferentes

Confundir os dois custou tempo. São **duas camadas independentes**:

| Camada | Variável | O que faz |
|---|---|---|
| Kill switch | `AI_PAID_PROVIDERS_ENABLED` | libera provedores **pagos**. Ollama é **isento**. |
| Allowlist | `AI_ALLOWED_LLM_OPERATIONS` | declara **quais operações** podem chamar LLM |

Default da allowlist: `fact_extraction`. O `crossability_reasoning` **não entra
por padrão** — um agente novo não ganha acesso a LLM só por ter sido escrito.

Para rodar o reasoning real (custo zero, via Ollama):

```
AI_ALLOWED_LLM_OPERATIONS=fact_extraction,crossability_reasoning
LLM_TIMEOUT_MS=600000
```

---

## 4. O BLOQUEADOR PRINCIPAL

```sql
SELECT count(*) FROM cross_ai.conhecimento_documento;  -- 0
SELECT count(*) FROM cross_ai.conhecimento_chunk;      -- 0
```

**O Cross Knowledge está vazio.**

Isto é o que trava as seis dimensões do Crossability — e a validação com LLM
real provou que **nenhum modelo resolve sozinho**. Com Ollama respondendo de
verdade (6 chamadas, 389 s), as seis dimensões voltaram
`conhecimento_insuficiente`, com `evidence_status: suficiente` em todas: o
modelo leu os fatos, citou E1/E5/E6/E7 corretamente, e se recusou a concluir
por faltar a perna metodológica.

Evidência: [`docs/ai/validation/reasoning-ollama-live-output-showcase.md`](ai/validation/reasoning-ollama-live-output-showcase.md).

> **Correção de diagnóstico registrada.** Antes disso, a limitação estava
> documentada como "o kill switch bloqueia o reasoning". Era só a camada de
> cima. Ligar provedor pago **agora não mudaria nada**: o `gpt-4o` responderia
> a mesma coisa — "a metodologia Cross não foi recuperada" — e cobraria.

### Ordem recomendada

```
1. popular o Cross Knowledge com a metodologia da Cross   ← desbloqueia tudo
2. reexecutar a validação (mesmo modelo, custo zero)
3. avaliar se qwen3:4b sustenta a qualidade
4. só então decidir sobre provedor pago
```

**Pergunta aberta para a equipe:** onde está a metodologia da Cross? Documento,
planilha, ou ainda só com as pessoas? Sem essa resposta, o passo 1 não começa.

---

## 5. Restrições permanentes do projeto

Instruções dadas pelo Igor, **ainda em vigor**:

1. **Não conectar LLM pago** sem autorização explícita. "Vamos manter no Ollama
   gratuito nesse momento."
2. **NUNCA usar banco de produção.** Nunca usar `DATABASE_URL` de produção como
   `TEST_DATABASE_URL`. Migrations só em `cross_test` — não staging, não produção.
3. **Firecrawl:** se a arquitetura não permitir habilitá-lo isoladamente sem
   liberar outros providers pagos, **PARE**. Não enfraqueça o kill switch.
   *(Situação atual: como as chaves OpenAI/DeepSeek estão vazias, ligar o kill
   switch destravaria só o Firecrawl na prática. O isolamento existe de fato.)*
4. **Nunca salvar secrets** em artefatos versionados.
5. **Nenhum teste anterior pode ser removido**; não enfraquecer gate existente
   para fazer trabalho novo passar.
6. Cada sprint termina em **PARE E AGUARDE VALIDAÇÃO HUMANA**.

---

## 6. Decisões de arquitetura que não estão no código

### ADR-009 — Evidence ≠ Cross Knowledge

**Evidence** é "o que se sabe do mundo" (fatos com fonte). **Cross Knowledge** é
"como a Cross interpreta" (metodologia). Nunca se misturam. É por isso que uma
dimensão precisa das **duas pernas** para ser sustentada.

### ADR-010 — Cross Memory não vira Cross Knowledge automaticamente

Passa por Human Gate.

### `confidence` ≠ `assessment` ≠ `score`

Três perguntas distintas:

| Campo | Pergunta |
|---|---|
| `confidence` | quanta certeza factual? |
| `assessment` | quão forte é o encaixe? |
| `score` | quanto vale comercialmente? |

`assessment: alta` + `confidence: 20` é combinação **legítima** (sinais bons,
evidência rasa). Juntar os três num número só apagaria a diferença.

### `null` ≠ `0`

Custo desconhecido é **bloqueado** em modo estrito. Tratar "não sei quanto
custa" como gratuito seria assinar cheque em branco. Vale também para sinais:
sinal desconhecido fica **fora do denominador**, nunca conta como zero.

### A IA propõe, o humano decide

Nenhuma saída de agente vira efeito operacional sem ação humana explícita.
Aprovar **não** promove — são ações separadas.

---

## 7. Armadilhas que já custaram tempo

Registradas para não se repetirem:

| Armadilha | Detalhe |
|---|---|
| **`\b` antes de acentuada** | Regex JS: `\b` não funciona antes de caractere acentuado. Bateu 3× (objeção AI-08, "turnê" AI-09, correlação AI-10). Remova o `\b` inicial. |
| **Nomes de coluna** | Vários palpites errados: `parceria.parte_id`→`parte_parceira_id`, `publicado_em`→`vigente_desde`, `persona='admin'`→`'administrador'`, `organizacao.segmento`→`segmento_principal`. **Sempre confira no banco.** |
| **Fixture de fato** | Precisa de `natureza: "fato"` e `claim` (não `texto`), e `source_refs` (não `fontes`). Sem isso o perfil sai **vazio silenciosamente**. Use `fatoSchema.parse()` no fixture. |
| **Perfil é `identidade.nome`** | Não `entidade`/`parte_id` no topo. Monte via `construirPerfil()` real, não à mão. |
| **`$2` ambíguo no pg** | Parâmetro usado em atribuição e em `IN (...)` dá "inconsistent types deduced". Cast explícito: `$2::varchar`. |
| **Transação abortada** | Teste de falha esperada precisa de `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`. |
| **`Date` vs ISO string** | `pg` devolve `Date`; vários schemas esperam string ISO. |
| **Vitest `--reporter=basic`** | Não existe nesta versão. Use o default. |
| **Here-string no PowerShell** | Aspas duplas dentro de `@'...'@` quebram o parse do git. Use `git commit -F arquivo`. |
| **Bash tool indisponível** | O binário do Git bash não existe nesta máquina. Tudo via PowerShell. |

---

## 8. O que foi construído (AI-03 a E2E-01)

Cada sprint tem doc técnico em `docs/ai/NN-*.md` e showcase com saída real em
`docs/ai/validation/`. Os números dos showcases saem da execução — nenhum é
digitado à mão.

| Sprint | Entrega |
|---|---|
| AI-03 | Entity Intelligence — perfil versionado com proveniência |
| AI-04 | Crossability Reasoning — 6 dimensões, metodologia via RAG |
| AI-05 | Internal Matching — candidatos por sinais internos |
| AI-06/07A/07B | Recommendation, Human Gate, promoção a oportunidade |
| DOMAIN-01 | Reunião sem vínculo obrigatório com oportunidade |
| AI-08 | Meeting Intelligence — extração de transcrição |
| AI-09 | Big Moment — sinal de marca (tabela própria) |
| AI-10 | Monitoring — ciclo finito, delta por conteúdo |
| E2E-01 | **Cross Orchestrator** — 3 jornadas, reuso, Human Gates |

### O Orchestrator em uma frase

Máquina de estados determinística que coordena os agentes existentes.
**Não é LLM** — perguntar a um modelo "qual agente rodar agora?" seria
imprevisível e caro sem ganho.

- **REUSE BEFORE RERUN:** 5 etapas caem para 2 quando há artefato válido
- **Matching nunca é reutilizado** entre direções (direção = identidade)
- **Human Gates param de verdade:** aprovar ≠ promover
- **Fail-safe:** perfil sem fatos ⇒ `evidencia_insuficiente` (≠ falha)

---

## 9. Bug encontrado e corrigido na inspeção do payload

Vale registrar porque a causa não era óbvia.

A jornada construía o perfil da **origem** mas nunca o do **candidato**. Como
`evidencias_suporte` é montada a partir do perfil do candidato, **toda**
recomendação saía condenada a `requer_enriquecimento`.

Corrigido reaproveitando os sinais que o Matching **já lê** da base interna
(sem pesquisa nova, sem custo):

| | Antes | Depois |
|---|---|---|
| status | `requer_enriquecimento` | `pronta_para_revisao` |
| confiança | 10 | **60** |
| evidências de suporte | 0 | 3 |
| hipótese | `null` | texto completo |

---

## 10. Pendências

1. **Popular o Cross Knowledge** ← desbloqueia tudo (ver §4)
2. **Atualizar o SAD** — números defasados, sem o Orchestrator
3. **Saída final de 78 itens** da E2E-01 (nunca entregue)
4. `LIVE_WEB` pendente — Evidence por adaptador controlado
5. `REAL_EMBEDDINGS` pendente — RAG usa stub (só importa depois do §4)
6. Sem rota HTTP e sem scheduler para o Orchestrator
7. CVE alta preexistente em `ip-address` (transitiva via `express-rate-limit`)
8. RLS não habilitado (dívida antiga, ver SAD §11)
9. Concorrência de resume (`versao`, optimistic locking) não testada em corrida

---

## 11. Segurança — ação imediata

**Dois tokens do GitHub foram expostos em conversa** durante a migração:

```
github_pat_11B6FGJ2Q0p6...   (retornou 401, provavelmente já inválido)
ghp_QOerxiOJYLyY2xTQ...      (VÁLIDO, usado no push de 11/09)
```

**Revogue os dois** em https://github.com/settings/tokens.

O push foi feito com URL efêmera — o token **não** ficou gravado em
`.git/config` nem no credential store (verificado). Na máquina nova, autentique
uma vez com `git push` na janela interativa e deixe o Credential Manager
guardar.

---

## 12. Primeiros passos na máquina nova

```bash
# 1. clonar
git clone https://github.com/igor-rodriguess/crossNetworking
cd crossNetworking
git checkout melhorias/qualidade-e-seguranca

# 2. dependências (Node 22+)
cd backend && npm install
cd ../frontend && npm install

# 3. .env — NÃO vem no clone
cp backend/.env.example backend/.env    # preencher

# 4. banco de teste
docker compose up -d db-test
cd backend && npm run db:migrate:test

# 5. conferir
npm test          # esperado: 642 passando
npm run typecheck # esperado: limpo
```

Se os 642 passarem, o ambiente está equivalente ao desta máquina.

### Ollama (opcional, para reasoning real)

```bash
ollama pull qwen3:4b
# depois:
AI_ALLOWED_LLM_OPERATIONS=fact_extraction,crossability_reasoning \
LLM_TIMEOUT_MS=600000 \
npx tsx scripts/live-reasoning-ollama.ts
```

---

## 13. Onde ler mais

| Assunto | Arquivo |
|---|---|
| Arquitetura geral | `docs/SAD.md` *(defasado — ver §1)* |
| Infraestrutura e deploy | `docs/ARQUITETURA_INFRAESTRUTURA.md` |
| Arquitetura-alvo da IA | `docs/ai/09-cross-intelligence-target-architecture.md` |
| Guardrails de custo | `docs/ai/12-cost-guardrails.md` |
| Orchestrator | `docs/ai/22-cross-orchestrator.md` |
| Validação com LLM real | `docs/ai/validation/reasoning-ollama-live-output-showcase.md` |
| Saídas brutas | `docs/ai/validation/raw/` |
