# 19 — Meeting Intelligence Agent

**Sprint AI-08** · Documentação técnica curta.
Artefato principal: [output showcase](validation/meeting-intelligence-agent-output-showcase.md).

---

## Responsabilidade

Responde **"o que de relevante para inteligência de negócio foi realmente dito,
decidido, solicitado, oferecido ou deixado em aberto nesta reunião?"**.

Não é summarizer: cada item aponta segmento, speaker e trecho literal.

Não cria oportunidade, projeto, parceria ou reunião. Não altera funil, Paper ou
Score Card. Não escreve em Cross Knowledge nem promove Cross Memory.

---

## Input / Output

**Entrada** — `EntradaMeetingIntelligence`:

| Campo | Papel |
|---|---|
| `reuniaoId` | Reunião analisada |
| `conteudo` | Texto (notas, ata, transcript) |
| `mapeamentoSpeakers` | rótulo → Parte ou usuário interno |
| `contexto` | candidatura / projeto / parceria — todos opcionais |
| `extrator` | Ponto de extensão para trocar o extrator |

**Saída** — `MeetingIntelligenceResult`: itens por categoria, segmentos,
participantes, conflitos, lacunas, resumo executivo, `memory_candidates`,
rejeitados, telemetria.

---

## Taxonomia

```
objetivo · interesse · necessidade · dor · ativo · oferta
restricao · objecao · decisao · compromisso · proximo_passo
pergunta_aberta · meeting_claim · sinal_relacionamento · outro_sinal
```

Enxuta de propósito. As distinções que importam são regras, não vocabulário.

---

## Proveniência

Todo item carrega:

```
source_segments[]   →  segmentos que sustentam (nunca vazio)
supporting_quote    →  trecho literal, conferido contra o conteúdo
speaker_rotulo      →  quem disse
parte_id            →  null quando o speaker não foi resolvido
```

Item com segmento inexistente, quote inventada ou PII incidental é **rejeitado**
e registrado em `rejeitados[]`.

---

## Semântica de claim

```
extraction_confidence   →  quão claro está que foi DITO
verification_status     →  se é VERDADE (sempre `nao_verificado` aqui)
```

Independentes. Confiança 85 na extração não implica verificação factual. Quem
verifica o mundo é o Research & Evidence.

`primeira_pessoa` marca declaração sobre a própria entidade de quem fala.

---

## Decisão × opinião

Opinião (`eu gosto`, `acho que`, `talvez`) é bloqueada para:
**decisão, objetivo, compromisso, próximo passo**.

Permanece válida para **interesse** e **objeção** — que são opinião por
natureza.

Negação bloqueia decisão via lookbehind: "não vamos conseguir" é objeção, não
deliberação.

---

## Versionamento e idempotência

```
cross_execution.reuniao_conteudo    (reuniao_id, versao)   UNIQUE
cross_ai.analise_reuniao   (reuniao_id, conteudo_hash, extractor_versao) UNIQUE
```

Conteúdo idêntico não cria versão. Reanálise do mesmo texto com o mesmo
extrator devolve a análise existente. Editar a ata gera nova versão sem apagar
a anterior.

---

## Controle de contexto

```
maxCaracteresEntrada  = 200.000
maxSegmentosPorLote   = 40
maxItensPorTipo       = 50
```

Centralizados em `LIMITES_REUNIAO`. Reunião longa é processada em lotes com
merge determinístico — não depende de caber num prompt único.

---

## Modo do extrator

```ts
interface ExtratorSemantico {
  modo: "deterministico" | "local" | "pago";
  versao: string;
  extrair(segmentos): Promise<...>;
}
```

Hoje: `deterministico-v1`, padrões linguísticos em português.

Separado do pipeline para que trocar por modelo real não exija reescrever
proveniência, validação, dedupe ou persistência.

---

## Integração futura

`memory_candidates[]` sai com `promotion_status = "nao_promovido"`. A promoção a
Cross Memory exigirá Human Gate próprio — não é escopo desta Sprint.

Meeting claims poderão futuramente alimentar o Research & Evidence para
verificação externa.

---

## Limitações

1. `REAL_SEMANTIC_VALIDATION = PENDING` — extração por padrão, não semântica.
2. Sem áudio/vídeo: recebe texto.
3. Normalização de data só para formatos inequívocos.
4. Conflitos detectados por polaridade léxica.
5. Sem rota HTTP.
