# 20 — Big Moment Intelligence

**Sprint AI-09** · Documentação técnica curta.
Artefato principal: [output showcase](validation/big-moment-intelligence-output-showcase.md).

---

## Responsabilidade

Responde **"esse fato representa um momento temporal relevante para a Cross?"**.

Separação que não pode ser borrada:

```
Research & Evidence  →  "o que aconteceu?"          (autoridade factual)
Big Moment           →  "isso é um momento?"        (relevância temporal)
Crossability         →  "como a Cross interpreta?"  (metodologia)
Recommendation       →  "há hipótese de negócio?"   (proposta)
```

Consome Evidence pronta. Não rasteja a web, não reexecuta Crossability, não
cria Recommendation, Opportunity nem altera funil.

---

## Por que uma tabela nova

`cross_intelligence.big_moment` já existe, mas é agenda de marcos **pessoais**
(`pessoa_id NOT NULL`). Não comporta marca/empresa e não guarda Evidence,
temporalidade, fingerprint ou versão.

A migration **063** cria `cross_ai.big_moment_signal` e deixa a original
intacta.

---

## Taxonomia

21 tipos controlados: `tour`, `concert`, `festival`, `media_release`,
`product_launch`, `collection_launch`, `campaign`, `geographic_expansion`,
`store_opening`, `market_entry`, `milestone`, `anniversary`, `sponsorship`,
`partnership_announcement`, `ambassadorship`, `acquisition`,
`leadership_change`, `sport_event`, `cultural_moment`, `corporate_move`,
`other`.

Ordem de avaliação importa: `tour` precede `concert` — "turnê com show" é turnê.

---

## Modelo temporal

```
temporal_status:  announced | scheduled | ongoing | completed | cancelled | unknown
janela:           pre_event | active | post_event | expired | unknown
```

**Anúncio ≠ ocorrência.** A janela deriva das datas + relógio da execução;
`LIMITES_MOMENTO.diasPosEvento` define quanto tempo depois ainda é relevante.

Datas só são normalizadas quando inequívocas. "Segundo semestre" fica em
`expressao_temporal` com `inicia_em = null`.

---

## Relação com Evidence

| Item | Origem |
|---|---|
| `evidence_refs` | `fact_id` do Evidence Package |
| `forca_verificacao` | derivado de `verificacao` + `dominios_independentes` |
| frescor | `publicado_em` do fato |

Momento sem Evidence não existe. Claim de reunião entra como
`unverified_internal_signal`, nunca como fato.

---

## Deduplicação

```
event_fingerprint = sha256(entidade | tipo | assunto | contexto_temporal)
```

Agrupa múltiplas fontes num momento. O contexto temporal impede colapsar
eventos distintos (shows em datas diferentes).

---

## Persistência e versionamento

```
cross_ai.big_moment_signal   (event_fingerprint UNIQUE)
cross_ai.big_moment_versao   (big_moment_id, versao) UNIQUE
```

Upsert por fingerprint: nova Evidence **atualiza** e registra versão. Sem
novidade → `inalterado`, versão preservada.

Trajetória (`announced → cancelled`) fica registrada. A mudança é a informação.

---

## Consultas para o Monitoring

```ts
listarPorParte(parteId)
listarAtivos(limite)          // janela active/pre_event, exclui cancelados
listarRecentes(desde, limite) // primeiro_visto_em >= desde
carregarConhecidos(entidade)  // distingue novo de atualização
listarVersoes(bigMomentId)
```

`primeiro_visto_em` / `ultimo_visto_em` são a base da comparação entre ciclos.

---

## Modo do classificador

```ts
interface ClassificadorMomento {
  modo: "deterministico" | "local" | "pago";
  versao: string;
  classificar(fato): { tipo, magnitude, marketingApenas };
}
```

Hoje `deterministico-v1`. Separado do pipeline para que trocar por modelo real
não exija reescrever fingerprint, temporalidade, agrupamento ou persistência.

---

## Integração futura (AI-10)

O Monitoring consultará `listarAtivos` e `listarRecentes` a cada ciclo, sem
reprocessar análises. `entity_intelligence_update_candidates` e
`matching_trigger_candidate` ficam como propostas — nenhuma promovida.

---

## Limitações

1. Classificação por padrão linguístico (PT-BR); semântica PENDING.
2. Conflito de datas separa fingerprints em vez de gerar conflito único.
3. Sem hierarquia turnê → shows.
4. Magnitude derivada do tipo, não do alcance real.
5. Sem rota HTTP.
