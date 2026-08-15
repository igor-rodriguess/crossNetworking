# 04 — Auditoria do RAG / Cross Knowledge

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

---

## Resposta à pergunta central

> **"O sistema atual realmente ensina à IA o jeito Cross de pensar?"**

# NÃO.

**Classificação: INSUFFICIENT.**

A infraestrutura de RAG está bem construída e funcional. O que falta é o
conteúdo e a conexão: **a metodologia Cross não está indexada**, e o pipeline que
gera as oportunidades do produto **não consulta o RAG por decisão explícita de
código**.

Quatro evidências, todas verificáveis:

### Evidência 1 — O pipeline principal ignora o RAG deliberadamente

[agentes.service.ts:2019-2026](backend/src/modules/agentes/agentes.service.ts#L2019-L2026):

```ts
if (pipeline === "partner_discovery") {
  // A Base Cross contextualiza o planejamento e a deduplicação, mas não
  // participa da descoberta nem do fit. Não a consultamos neste pipeline.
  etapas.push({
    nome: "rag_retrieval",
    status: "ignorada",
    observacao: "Partner Discovery usa exclusivamente evidências externas verificáveis.",
  });
}
```

E, no reasoning ([linha 2093](backend/src/modules/agentes/agentes.service.ts#L2093)):

```ts
contexto_rag: pipeline === "partner_discovery" ? undefined : rag?.trechos...
```

O `partner_discovery` — **o pipeline que produz as oportunidades que a Cross
vê** — nunca recebe contexto da base de conhecimento.

> **Importante:** esta é uma decisão consciente e defensável. O comentário
> explica o porquê: evitar que conhecimento interno seja apresentado como
> evidência externa de uma oportunidade nova. O problema não é a decisão — é que
> **não existe o outro caminho**: nenhum fluxo aplica a metodologia Cross ao
> julgar um parceiro.

### Evidência 2 — O reasoning que usa RAG não é o que roda

Só `market_intelligence` consulta o RAG, e só ele chama `raciocinarCrossability()`
(a versão com LLM). O `partner_discovery` usa a versão heurística, sem LLM e sem
RAG.

Resultado: **as duas capacidades que fariam a IA "pensar como a Cross" — LLM e
metodologia recuperada — estão no caminho que não é o principal.**

### Evidência 3 — Não há metodologia indexada

O enum de origens ([migration 035](backend/database/migrations/035_rag_embeddings.sql#L22-L28)):

```sql
CREATE TYPE cross_ai.documento_origem AS ENUM (
    'paper', 'perfil_parte', 'decisao', 'coleta_web', 'manual'
);
```

Há `paper` (o documento de metodologia por frente) e `decisao` (decisões
passadas) — as duas origens que **poderiam** carregar o jeito Cross. Mas:

- **Não há rotina de ingestão automática.** A única entrada é
  `POST /agentes/rag/ingerir`, manual, com trechos passados no corpo.
- **Não há sincronização.** Quando um Paper é validado ou uma decisão é
  registrada, nada os envia ao RAG.
- Não encontrei no repositório nenhum seed, script ou migration que popule a
  base vetorial com a metodologia Crossability ou o Score Card.

**Não foi possível contar os chunks existentes** — exigiria conexão ao banco em
operação, fora do escopo desta auditoria (que é estática e não toca produção). O
número real deve ser verificado com `GET /agentes/rag/buscar` ou
`SELECT count(*) FROM cross_ai.documento_rag`.

### Evidência 4 — Sem chave OpenAI, os embeddings são hash de palavras

[embeddings.ts:31-53](backend/src/modules/agentes/shared/embeddings.ts#L31-L53):

```ts
function embeddingMock(texto: string): number[] {
  // 4 posições por palavra (hash → índices estáveis), sinais alternados.
  const h = createHash("sha256").update(palavra).digest();
  ...
}
```

O mock é engenhoso — palavras iguais caem nas mesmas posições, então a
similaridade de cosseno captura **sobreposição de vocabulário**. Mas isso é
busca lexical disfarçada de semântica: "público jovem urbano" e "audiência
millennial metropolitana" não têm palavra em comum e ficariam distantes.

E o mock é o padrão: `embeddingMock()` só é falso com `OPENAI_API_KEY`
([linha 23](backend/src/modules/agentes/shared/embeddings.ts#L23)) — que não
existe hoje. Com `AI_PROVIDER=ollama`, **o RAG inteiro roda em embeddings
lexicais**.

---

## 1. Infraestrutura — o que está bem feito

| Componente | Situação | Evidência |
|---|---|---|
| pgvector | **READY** | `CREATE EXTENSION vector` (035) |
| Dimensão consistente | **READY** | 1536 em código e coluna |
| Índice HNSW | **READY** | 036 substituiu ivfflat com justificativa correta para baixo volume |
| Distância de cosseno | **READY** | operador `<=>` |
| Filtro por origem | **READY** | `buscarSimilares(..., { origem })` |
| Marca real/mock | **READY** | `embedding_origem` distingue |
| Metadados livres | **READY** | JSONB |
| Vínculo a domínio | **PARTIAL** | `referencia_id` existe, sem FK |
| Contagem | **READY** | `contarDocumentos()` |

A camada técnica está correta. **O problema é de conteúdo e de conexão, não de
engenharia.**

---

## 2. Estratégia de chunking — AUSENTE

**Não existe chunking.** `ingerir()` recebe `input.trechos: string[]` e insere um
registro por elemento do array:

```ts
for (let i = 0; i < input.trechos.length; i++) {
  await ragRepo.inserirDocumento(client, { conteudo: input.trechos[i], ... });
}
```

Quem chama decide o recorte. Não há:
- divisão por tamanho ou tokens
- sobreposição entre trechos
- respeito a fronteira semântica (parágrafo, seção)
- limite de tamanho — um trecho de 50 mil caracteres seria inserido inteiro,
  gerando um embedding diluído e inútil

Para ingerir um Paper de metodologia com qualidade, **o chunking precisa
existir**.

---

## 3. Retrieval

| Aspecto | Situação |
|---|---|
| Top-K | Fixo em 5 no pipeline ([linha 2037](backend/src/modules/agentes/agentes.service.ts#L2037)) |
| Limiar de similaridade | **AUSENTE** — trechos irrelevantes entram se a base for pequena |
| Reranking | **AUSENTE** |
| Filtro por cliente | **AUSENTE** — a busca não filtra por `cliente_id` |
| Consulta | Concatenação `cliente + objetivo + entidade_foco`, truncada em 2000 chars |

**Achado de isolamento:** `buscarSimilares` filtra apenas por `origem`. Não há
filtro por cliente. Num RAG multi-cliente, a metodologia de um cliente poderia
ser recuperada no contexto de outro. Hoje o risco é contido (1 usuário interno,
base pequena), mas **é a mesma classe de problema do RLS ausente**.

---

## 4. Rastreabilidade trecho → conclusão — AUSENTE

Pergunta do briefing: *"é possível rastrear qual trecho sustentou uma
conclusão?"*

**Não.**

O que existe:
- `execucao_agente` do `rag_retrieval` guarda os trechos recuperados na `saida`
- `execucao_agente` do `crossability_reasoning` guarda a análise produzida

O que falta: **a ligação entre os dois**. Não há coluna, nem campo no JSONB, que
diga "a dimensão `fit_estrategico` desta análise se apoiou no trecho `id=X`".

Os trechos entram no prompt concatenados ([crossability-reasoning.agent.ts:67-69](backend/src/modules/agentes/crossability-reasoning.agent.ts#L67-L69)):

```ts
`Contexto recuperado da base Cross (use apenas como apoio; não invente além dele):\n${input.contexto_rag.join("\n---\n")}`
```

Depois disso, **a origem se perde**. Sabe-se que 5 trechos foram usados na
execução; não se sabe qual sustentou qual afirmação.

Para uma plataforma cuja premissa é "IA propõe com fontes rastreáveis", esta é
uma lacuna estrutural.

---

## 5. Versionamento da metodologia — PARCIAL (fora do RAG)

O versionamento **existe no domínio**: `cross_methodologies` tem Paper com
versões e validação, e o Score Card tem modelo/versão/vigência (RN022).

Mas **não existe no RAG**: `documento_rag` não tem coluna de versão. Se um Paper
for reindexado após revisão, os trechos antigos permanecem — sem forma de saber
qual versão sustentou uma análise passada, nem de expirar o conteúdo velho.

---

## 6. Onde o Crossability entra

| Caminho | Usa RAG? | Usa LLM? |
|---|---|---|
| `partner_discovery` (principal) | **Não** | **Não** |
| `market_intelligence` | Sim (5 trechos) | Sim |

As seis dimensões vivem em três lugares:

1. **No prompt** — `SYSTEM` em `crossability-reasoning.agent.ts:25-49`, descritas
   em texto fixo
2. **No schema** — `analiseCrossabilitySchema` impõe a estrutura das 6 dimensões
3. **Na heurística** — `raciocinarCrossabilityComEvidenciaExterna()` monta os
   textos por template

**A metodologia está codificada no prompt, não recuperada do conhecimento da
Cross.** Isso significa que refinar o "jeito Cross de pensar" hoje exige
**alterar código**, não alimentar a base.

Este é o ponto central da resposta INSUFFICIENT.

---

## 7. Classificação final

| Dimensão | Classe |
|---|---|
| Infraestrutura (pgvector, HNSW, cosseno) | **READY** |
| Serviço de ingestão e busca | **READY** |
| Embeddings com chave OpenAI | **READY** (não exercitado) |
| Embeddings sem chave | **INSUFFICIENT** (lexical) |
| Chunking | **INSUFFICIENT** (inexistente) |
| Conteúdo de metodologia indexado | **INSUFFICIENT** |
| Sincronização automática | **INSUFFICIENT** |
| Uso no pipeline principal | **INSUFFICIENT** (desligado) |
| Rastreabilidade trecho→conclusão | **INSUFFICIENT** |
| Versionamento no RAG | **INSUFFICIENT** |
| Isolamento por cliente | **INSUFFICIENT** |
| **Ensina o jeito Cross de pensar?** | **NÃO — INSUFFICIENT** |

---

## 8. O que faria virar READY

Em ordem de dependência (**não executar nesta sprint**):

1. **Chunking** com tamanho e sobreposição definidos
2. **Ingestão da metodologia** — Papers validados, Score Cards, decisões
   históricas com racional
3. **Sincronização** — ao validar um Paper, reindexar
4. **Chave OpenAI** para embeddings semânticos reais
5. **Ligar o RAG ao reasoning do `partner_discovery`** — preservando a separação
   entre "evidência externa" e "critério interno": o RAG entra como *como julgar*,
   não como *prova de que o parceiro existe*
6. **Rastreabilidade** — registrar quais `documento_rag.id` sustentaram a análise
7. **Filtro por cliente** no retrieval
8. **Versionamento** do conteúdo indexado

O item 5 é o mais delicado — mexe numa decisão de arquitetura deliberada e
precisa de discussão, não de execução direta.

**Continua em:** `05-evidence-quality-audit.md`.
