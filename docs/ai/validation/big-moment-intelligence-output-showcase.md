# Big Moment Intelligence — Output Showcase

**Sprint AI-09** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · LLM calls: **0** · Embedding calls: **0**

```
Paid LLM              = OFF
Paid Embeddings       = OFF
Classifier Mode       = deterministico (v1)
Real Semantic Valid.  = PENDING
```

> Pergunta do agente: **"esse fato representa um momento temporal relevante?"**
> Não "o que aconteceu" (Research & Evidence) nem "há oportunidade"
> (Recommendation).

---

## Descoberta da auditoria

`cross_intelligence.big_moment` **já existia** — e é outra coisa:

```
cross_intelligence.big_moment
  └── pessoa_id NOT NULL → cross_core.pessoa
```

É uma **agenda de marcos pessoais**, presa a `pessoa`. Não comporta marca nem
empresa, e não guarda Evidence, status temporal, fingerprint ou versão.

Reaproveitá-la exigiria desfigurar uma feature existente. A migration **063**
cria estrutura nova em `cross_ai` e deixa a original intacta (12 colunas,
verificado).

---

## CASO A · Artista / turnê

```
[tour] O artista anunciou turnê nacional com show em 20/11/2026.
   status = announced      janela = pre_event      score = 95
   evidence = EV-01        verificação = corroborada
   data = 2026-11-20
   risco: Anúncio, não ocorrência confirmada.

   crossability_activation: territorios, publicos
```

**Artista é Parte com papel**, não domínio paralelo. O mesmo agente atende
marca, empresa e Cliente Cross.

Note `crossability_activation`: aponta o que o Crossability **já** identificou.
Não recalcula nada.

---

## CASO B · Marca / lançamento

```
[collection_launch] A marca lançou nova coleção de inverno.
   status = unknown        janela = unknown        score = 67.5
   verificação = fonte_unica
   lacuna: Nenhuma data do evento identificada.
   lacuna: Sustentado por fonte única.
```

Sem data no fato, o status fica `unknown` — **nenhuma data foi inventada**.

---

## CASO C · Expansão geográfica

```
[geographic_expansion] A empresa anunciou expansão para o mercado argentino.
   status = announced      score = 65.5
   update candidates (NÃO promovidos): 1
```

O momento gera **proposta** de atualizar territórios no perfil. Com
`promotion_status = nao_promovido` — Entity Intelligence não é tocado.

---

## Big Moment × notícia comum

**ENTROU:**

```
[tour] A marca anunciou turnê patrocinada com início em 20/11/2026.
   score = 91   corroborada   pre_event
```

**NÃO ENTROU:**

| Motivo | Fato | Explicação |
|---|---|---|
| `conteudo_rotineiro` | "atualizou sua política de privacidade" | operação de rotina, não acontecimento |
| `conteudo_rotineiro` | "tem termos de uso publicados" | idem |
| `baixa_relevancia_temporal` | "é simplesmente revolucionária e incrível" | retórica sem evento |

A diferença é estrutural: **tipo de evento reconhecido + magnitude + janela
temporal**, não impressão.

---

## Marketing não vira magnitude

| Fato | Magnitude |
|---|---:|
| "lançou uma nova coleção de verão" | **0.75** |
| "lançou a maior coleção **de todos os tempos**" | **0.38** |

O superlativo **reduz pela metade** — mas o lançamento continua sendo um
momento. Retórica sobre evento real não apaga o evento; retórica **sem** evento
é descartada.

---

## 3 fontes → 1 Big Moment

```
EV-21 + EV-22 + EV-23
        ↓
BM-86239a88   evidence_refs = 3   corroborada
grupos de evento: 1
```

Fingerprint determinístico: `entidade + tipo + assunto + contexto temporal`.
Dez matérias sobre o mesmo lançamento não viram dez momentos.

E não colapsa demais: shows em **12/10** e **15/10** têm fingerprints
diferentes — mesma turnê, eventos distintos.

---

## Temporalidade

| Caso | status | janela | data | expressão bruta |
|---|---|---|---|---|
| Futuro | `announced` | `pre_event` | 2026-12-20 | "20/12/2026" |
| Antigo | `completed` | `expired` | 2024-01-10 | "10/01/2024" |
| Cancelado | `cancelled` | `expired` | null | — |
| Data vaga | `announced` | `unknown` | **null** | **"segundo semestre"** |

**Anúncio ≠ ocorrência.** "Turnê anunciada para novembro" não significa que a
turnê aconteceu.

**"Segundo semestre" não vira 01/07.** A expressão original é preservada e a
data normalizada fica `null`.

Notícia de 2024 aparece `expired`, com frescor zerado — não é apresentada como
novidade.

---

## Meeting claim × Evidence

```
claim:  "Vamos abrir 20 lojas no próximo semestre."
status: unverified_internal_signal

Big Moment factual criado: 0
```

O que se disse numa reunião é sinal interno relevante — e **não** é fato
verificado. Fica separado, aguardando Evidence externa.

---

## Novidade × atualização × trajetória

```
run 1: novo         → v1
run 2: atualizado   → v2   (nova evidência)
run 3: cancelado    → v3

mesma linha? true
```

**Trajetória preservada:**

```
v1  announced   Momento identificado pela primeira vez.
v2  announced   1 nova(s) evidência(s).
v3  cancelled   Status mudou de announced para cancelled.
```

O cancelamento **não apaga** o agendamento anterior. A mudança *é* a informação
— e é exatamente disso que o Monitoring vai precisar.

Reexecutar sem novidade devolve `inalterado` e não infla versão.

---

## Consultas para o Monitoring

```
momentos ativos:   0
momentos recentes: 1
```

> **Sobre o zero:** o único momento do cenário terminou **cancelado** na v3,
> logo `expired`. A consulta está correta — filtra `active`/`pre_event` e exclui
> cancelados. Coberto por teste separado onde um momento futuro aparece.

---

## 500 evidências · guardrail

```
recebidas:    500
descartadas:  400
consideradas: 100
grupos:         1
momentos:       1

tempo: 3ms   llm_calls: 0   custo: US$ 0
```

Nenhuma chamada de modelo em 500 itens. O agente consome **fatos limpos**, não
HTML — é o que mantém o custo previsível quando um classificador real entrar.

---

## Score de triagem, explicável

```
relevancia_temporal   peso 0.30  valor 0.90  →  0.270   "Janela pre_event, status announced."
qualidade_evidencia   peso 0.25  valor 1.00  →  0.250   "Verificação corroborada, 3 domínios."
magnitude             peso 0.20  valor 0.90  →  0.180   "Magnitude derivada do tipo de evento."
frescor               peso 0.15  valor 1.00  →  0.150   "Publicado há 14 dia(s)."
relevancia_entidade   peso 0.10  valor 1.00  →  0.100   "Entidade vinculada a uma Parte."
                                                 ─────
                                          score = 95.0
```

É **score de triagem** — ordena o que olhar primeiro. Não é Cross Score, não é
probabilidade de parceria.

---

## Zero efeito operacional

```
oportunidades_criadas    = 0
recomendacoes_criadas    = 0
matching_disparado       = 0
perfis_alterados         = 0
score_cards_alterados    = 0
cross_knowledge_escrito  = 0
cross_memory_promovido   = 0
```

Confirmado também por contagem antes/depois no banco.

---

## Perguntas de validação

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | Diferencia Big Moment de notícia comum? | Sim — com motivo explícito |
| 2 | Sei quais fatos sustentam? | Sim — `evidence_refs` |
| 3 | Diferencia novidade, atualização e duplicata? | Sim — novo/atualizado/inalterado |
| 4 | Mantém contexto temporal? | Sim — 4 estados verificados |
| 5 | Inventa datas? | **Não** — expressão bruta preservada |
| 6 | Meeting claim vira fato? | **Não** |
| 7 | Reexecuta Crossability? | **Não** — só aponta o que já existe |
| 8 | Duplica Research? | **Não** — consome Evidence |
| 9 | Efeito operacional automático? | **Não** |
| 10 | Pronto para o Monitoring? | Sim — consultas e versionamento prontos |

---

## Limitações

1. **Classificação por padrão linguístico** em português. Paráfrase, ironia e
   inglês escapam. `REAL_SEMANTIC_VALIDATION = PENDING`.
2. **Conflito de datas separa em fingerprints distintos** em vez de gerar um
   conflito único — as duas versões são preservadas, mas não vinculadas. Ver
   teste "datas conflitantes".
3. **Sem hierarquia turnê → shows.** Cada data é um momento; `parent_moment`
   não foi implementado por decisão de escopo.
4. **Magnitude é derivada do tipo**, não do alcance real do evento.
5. **Sem rota HTTP** — agente e repositório prontos.
6. **Evidence fictícia no showcase** — o Evidence Package real da AI-02 não
   cobria esta variedade de tipos de evento.
