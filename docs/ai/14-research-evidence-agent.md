# 14 — Research & Evidence Agent

**Plataforma Cross** · Sprint AI-02
Data: 15/08/2026

> Registro técnico objetivo. O artefato de validação humana é
> [`validation/research-evidence-agent-output-showcase.md`](validation/research-evidence-agent-output-showcase.md).

---

## 1. Papel

Responde **"o que conseguimos afirmar sobre esta entidade com base em fontes
rastreáveis?"**.

Não responde se a entidade combina com a Cross (Crossability), nem que parceria
fazer (Recommendation), nem produz score de Score Card.

```
ENTIDADE → Planning → Collect → Credibility → [gate] → Extraction
                                                          ↓
        EVIDENCE PACKAGE ← Lacunas ← Verification ← Entity Resolution
```

---

## 2. Arquivos

### Novos

| Arquivo | Papel |
|---|---|
| `agentes/evidencia/evidencia.schema.ts` | Contratos: Fato, Fonte, EvidencePackage |
| `agentes/evidencia/research-evidence.agent.ts` | O agente |
| `agentes/evidencia/research-evidence.test.ts` | 19 testes (cenários A–N) |
| `scripts/showcase-research-evidence.ts` | Gera os 8 cenários de validação |

### Alterados

| Arquivo | Alteração |
|---|---|
| `agentes/agentes.schema.ts` | `conflitante` no enum; `contradita` na afirmação; `conflitante` no resumo |
| `agentes/fact-verifier.agent.ts` | Classificação passa a considerar contradição |
| `agentes/homologacao-hardening.test.ts` | Asserção do resumo inclui o campo novo |

**Nenhuma migration.** O agente não persiste — devolve o pacote em memória.
`execucao_agente` e `documento_rag` já cobrem auditoria e evidência bruta; criar
tabela agora seria antecipar sem consumidor.

---

## 3. Reuso

| Componente | Estado | Uso |
|---|---|---|
| Source Collector | Reutilizado | Sem alteração |
| Source Credibility | Reutilizado | Sem alteração |
| Fact Verifier | **Evoluído** | Ganhou `conflitante` |
| Entity Resolver | Reutilizado | Sem alteração |
| Cost Guardrails | Reutilizado | Busca autorizada antes de executar |
| Web Search | Reutilizado | Sem alteração |

`agentes.service.ts` **não foi tocado.** O agente é módulo próprio.

---

## 4. Contratos

**Fato** — `fact_id`, `claim`, `entidade`, `categoria` (16 valores),
`natureza` (fato \| inferência), `source_refs`, `dominios_independentes`,
`verificacao`, `confianca`, `publicado_em`, `coletado_em`, `conflito`.

**Fonte** — `source_id`, `url`, `titulo`, `dominio`, `tipo_fonte`
(oficial \| imprensa \| setorial \| agregador \| blog \| desconhecido),
`credibilidade_score/nivel/sinais`, `publicado_em`, `coletado_em`,
`query_origem`.

**EvidencePackage** — entidade, objetivo, status, plano, `planning_mode`,
`extraction_mode`, facts, sources, descartados, conflitos, lacunas,
ambiguidade, telemetria.

**Status:** `sucesso` · `evidencia_insuficiente` · `entidade_ambigua` ·
`bloqueado_por_guardrail`.

---

## 5. Decisões

**Contradição vence contagem.** Duas fontes independentes que se opõem não
corroboram. Antes, o verificador só contava domínios distintos — duas fontes
afirmando o oposto elevavam a afirmação a "corroborada". Era o erro mais
perigoso possível numa camada de evidência.

**Conflito não é sucesso.** Um pacote cujos únicos fatos são conflitantes
declara `evidencia_insuficiente`. Dizer "sucesso" faria o próximo agente tratar
divergência como conhecimento.

**Ambiguidade interrompe.** Identidade ambígua zera a pesquisa. Consolidar a
entidade errada propagaria o erro para Entity Intelligence e daí para a
recomendação.

**Recência reclassifica, não descarta.** Fora da janela, o fato vira
`contexto_empresa` — só é descartado quando o objetivo exige atualidade.
Informação de 2024 é irrelevante para *movimentos recentes* e continua válida
para *contexto da empresa*.

**Inferência tem teto de confiança 40.** Nunca se apresenta com a força de fato
verificado.

**Fato sem fonte é descartado.** Proveniência é requisito, não enfeite.

**Planning é determinístico por objetivo.** Termos fixos por objetivo, sem custo
de LLM. Perde adaptabilidade; ganha auditabilidade e custo zero.

**Cross Knowledge não é consultado.** Preencher lacuna factual com metodologia
transformaria interpretação em prova de fato (ADR-009). Verificado por teste.

---

## 6. Deduplicação

Duas camadas:

1. **URL idêntica** — mesma página coletada duas vezes
2. **Título similar > 0.75** (Jaccard sobre palavras) — press release replicado
   em domínios diferentes não é evidência independente

Sem isso, um único release em 10 veículos viraria "10 fontes corroborando".

---

## 7. Validação

| Verificação | Resultado |
|---|---|
| Testes novos | **19** (cenários A–N) |
| Suíte completa | **278/278** |
| Typecheck | **0 erros** |
| Regressões | 1, corrigida (ver §8) |
| Cenários de showcase | 8 |

---

## 8. Regressão encontrada e corrigida

`homologacao-hardening.test.ts` asserta a forma do resumo do Fact Verifier com
`toEqual`. O campo `conflitante` fez a asserção falhar.

**Não foi teste alterado para acomodar bug** — foi contrato que mudou
deliberadamente, e a asserção passou a refletir o contrato novo. O
comportamento verificado (corroborada / fonte_unica / nao_confirmada) segue
idêntico; `conflitante: 0` porque nenhuma afirmação daquele cenário é
contraditória.

---

## 9. Limitações

| # | Item | Severidade |
|---|---|---|
| 1 | **Extração real não exercitada** — Firecrawl desligado; todos os cenários usam fixtures | **Alta** |
| 2 | Planning determinístico, não adaptativo | Média |
| 3 | Detecção de contradição por negação lexical — erra para o lado de não detectar | Média |
| 4 | Sem persistência do Evidence Package | Média |
| 5 | Dedupe semântico simples (Jaccard) | Baixa |
| 6 | Sem checkpoint próprio | Baixa |
| 7 | `tipo_fonte` por lista fixa de domínios | Baixa |

### Sobre o item 1

É a limitação que define o que esta sprint pode e não pode afirmar.

Com `AI_PAID_PROVIDERS_ENABLED=false`, `extracaoEmModoMock()` devolve `true` e o
extrator nunca vê conteúdo de página. Rodar um cenário "real" produziria fatos
sintéticos com URLs de aparência legítima — pior do que não rodar, porque
pareceria convincente.

**O que está validado:** o mecanismo — credibilidade, dedupe, verificação,
conflito, recência, proveniência, guardrails, fail-safe.

**O que não está:** se o agente pesquisa bem.

**Como resolver:** ligar apenas o Firecrawl (sem LLM), rodar os mesmos 8
cenários com entidade pública e comparar com os JSONs preservados. Custo pequeno
e limitado pelos guardrails (`AI_MAX_SCRAPES_PER_RUN=15`).

### Sobre o item 3

`saoContraditorias` exige similaridade > 0.5 e divergência de negação. Não
detecta contradição semântica sem marcador ("lançou em março" × "lançou em
julho"). Deliberado: erra para o lado de **não** detectar, deixando as duas como
fontes separadas, em vez de inventar conflito onde não há.
