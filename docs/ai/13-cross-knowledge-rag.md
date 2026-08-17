# 13 — Cross Knowledge / RAG

**Plataforma Cross** · Sprint AI-01
Data: 15/08/2026

> Registro técnico objetivo. O artefato de validação humana é
> [`validation/cross-knowledge-rag-output-showcase.md`](validation/cross-knowledge-rag-output-showcase.md).

---

## 1. O que mudou

A auditoria (`docs/ai/04`) classificou o RAG como **INSUFFICIENT**: a metodologia
Cross vivia dentro de prompts, então mudar um critério de julgamento exigia
editar código. Esta sprint cria a camada onde o conhecimento é **dado
consultável**, versionado e validado.

**O RAG anterior (`cross_ai.documento_rag`) não foi alterado nem migrado.** Ele
continua servindo à ingestão de coleta web, papers e perfis — que é Evidence.
Cross Knowledge é estrutura nova e separada (ADR-009).

---

## 2. Arquivos

### Novos

| Arquivo | Papel |
|---|---|
| `database/migrations/055_cross_knowledge.sql` | Documento, versão, chunk + tipos e índices |
| `agentes/conhecimento/chunking.ts` | Chunking semântico por estrutura |
| `agentes/conhecimento/chunking.test.ts` | 7 testes (função pura) |
| `agentes/conhecimento/conhecimento.repository.ts` | SQL: upsert, retrieval com filtros |
| `agentes/conhecimento/conhecimento.service.ts` | Indexação e retrieval (CrossKnowledgeService) |
| `agentes/conhecimento/conhecimento.test.ts` | 15 testes (cenários A–L) |
| `scripts/showcase-cross-knowledge.ts` | Gera os cenários de validação |

### Alterados

**Nenhum.** A camada é aditiva: nenhum arquivo de produção existente foi
modificado, nenhum agente tocado, o Crossability intacto.

---

## 3. Modelo

```
conhecimento_documento     identidade estável (codigo UNIQUE)
    ├── categoria          10 valores (metodologia, critério, playbook…)
    ├── escopo             global | cliente | interno
    └── cliente_cross_id   obrigatório quando escopo='cliente' (CHECK)
         │
         ▼
conhecimento_versao        versionamento
    ├── versao             UNIQUE por documento
    ├── status             rascunho | validado | obsoleto
    ├── aprovado_em/_por   obrigatório quando validado (CHECK)
    └── substitui_versao_id
         │
         ▼
conhecimento_chunk         unidade de recuperação
    ├── secao              hierarquia do título
    ├── embedding          vector(1536) + índice HNSW
    └── embedding_origem   'openai' | 'mock'
```

**Índice parcial único:** `uq_conhecimento_versao_validada` garante **uma só
versão validada por documento**. Duas metodologias conflitantes recuperadas
juntas é o tipo de erro que o banco deve impedir, não o código.

---

## 4. Chunking

Divisão pela **estrutura** do documento, não por contagem de caracteres:

1. **Seções de markdown** (`#` a `######`), com hierarquia preservada —
   `Metodologia Crossability › Compatibilidade de públicos`
2. **Parágrafos**, agrupados até o teto (1200 chars)
3. **Frases**, como último recurso — nunca corta no meio de palavra

O rótulo da seção é **prefixado ao conteúdo** do chunk: o embedding passa a
carregar o contexto do capítulo, e um trecho sobre "territórios" recuperado
isoladamente ainda diz de qual metodologia veio.

Fragmentos abaixo de 120 chars são anexados ao anterior **da mesma seção** —
juntar seções diferentes misturaria conceitos não relacionados.

---

## 5. Retrieval

```
consulta → embedding → busca vetorial (cosseno, HNSW)
                            │
                            ├── SQL filtra: status='validado' + escopo + categoria
                            ▼
                     candidatos (topK × 4)
                            │
                            ├── limiar de relevância
                            ├── deduplicação por documento+seção
                            └── corte top-k
                            ▼
                     KnowledgeReference[]
```

**Filtros no banco, não em memória.** Trazer conhecimento de outro cliente para
descartar em TypeScript deixaria o dado passar pela aplicação, e um filtro
esquecido viraria vazamento.

**Defaults conservadores:** `topK=5`, `limiarRelevancia=0.35`.

Cada resultado carrega proveniência completa: `ref` (K1, K2…), `chunkId`,
`codigo`, `documento`, `secao`, `categoria`, `versao`, `escopo`, `status`,
`relevancia`, `aprovadoEm`. O agente pode citar *"esta conclusão usou K1 e K3"*.

Cada descarte carrega motivo nomeado: `baixa_relevancia`, `nao_validado`,
`obsoleto`, `duplicado`, `excedeu_top_k`.

---

## 6. Separação Evidence ↔ Knowledge

| | Evidence | Cross Knowledge |
|---|---|---|
| Responde | "o que sabemos do mundo" | "como a Cross interpreta" |
| Tabela | `cross_ai.documento_rag` | `cross_ai.conhecimento_*` |
| Campos | `source_url`, `published_at`, `verification_status` | `codigo`, `versao`, `secao`, `status` |
| Validação | corroboração por fontes | Human Gate |

São tabelas distintas, com serviços distintos e campos que não se sobrepõem.
**Não existe caminho pelo qual um trecho de metodologia vire prova de fato
externo.**

---

## 7. Embeddings

Reutiliza `shared/embeddings.ts` sem alteração — a abstração de provider já
existia e já respeita o kill switch.

Dimensão **1536**, igual à de `documento_rag`. **Não alterada**: mudar exigiria
reindexar tudo, e não há motivo nesta sprint.

Com `AI_PAID_PROVIDERS_ENABLED=false`, `embedding_origem` grava `'mock'` — o que
permite distinguir, depois, o que foi indexado com stub e o que foi com provider
real.

---

## 8. Idempotência

- Documento: `ON CONFLICT (codigo) DO UPDATE`
- Versão: `ON CONFLICT (documento_id, versao) DO UPDATE`
- Chunks: `DELETE` + `INSERT` da versão

O DELETE é deliberado: uma reindexação pode produzir **menos** chunks que a
anterior, e um upsert por ordem deixaria órfãos das posições finais apontando
para conteúdo que não existe mais.

---

## 9. Validação

| Verificação | Resultado |
|---|---|
| Migration 055 em PostgreSQL 16.4 + pgvector 0.8.6 | Aplicada |
| Tabelas, índices, HNSW, constraints | Verificados |
| Testes novos | **22** |
| Suíte completa | **259/259** |
| Typecheck | **0 erros** |
| Regressões | Nenhuma |

---

## 10. Limitações

| # | Item | Severidade |
|---|---|---|
| 1 | **Limiar calibrado para embeddings reais** — com o stub lexical, consultas legítimas caem abaixo de 0.35 | **Alta** enquanto o stub estiver ativo |
| 2 | Base pequena: 2 documentos, 11 chunks | Média |
| 3 | Sem interface de curadoria (validar/obsoletar é via serviço) | Média |
| 4 | Sem rota HTTP: o serviço é chamado internamente | Baixa — deliberado, retrieval pelo backend |
| 5 | Sem hybrid search (lexical + vetorial) | Baixa — validar vetorial primeiro |
| 6 | Metodologia ainda vive no prompt do Crossability | **Média** — migrar é a Sprint do Crossability |
| 7 | RLS não habilitado nas tabelas novas | Média — mesmo status do resto da plataforma |
| 8 | Rastreabilidade de retrieval não persiste em `execucao_agente` | Baixa |

### Sobre o item 1

**Não recalibrar o limiar com o stub.** Baixá-lo para 0.25 faria o sistema
parecer melhor agora e passar a entregar trechos fracos quando a chave real
entrar. O número correto só pode ser definido com embeddings reais.

### Sobre o item 6

O `SYSTEM` prompt do `crossability-reasoning.agent.ts` continua contendo a
descrição das seis dimensões. **Não foi removido** — removê-lo alteraria o
comportamento do agente, explicitamente fora do escopo. O mesmo conteúdo já está
indexado como Cross Knowledge; a migração do prompt para o retrieval é trabalho
da Sprint do Crossability.
