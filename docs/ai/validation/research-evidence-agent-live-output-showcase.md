# Research & Evidence Agent — Validação LIVE

**Plataforma Cross** · Sprint AI-02.1
Data: 15/08/2026 · **Status: REJECTED** (ver §Conclusão)

> **Esta execução usou fontes públicas REAIS.**
> Busca: DuckDuckGo (gratuito). Conteúdo: **Firecrawl real** (3 páginas por caso).
> Extração: determinística, sem LLM. **Nenhuma LLM paga foi utilizada.**
> Custo medido: **US$ 0.00** em tokens (Firecrawl não expõe custo unitário à aplicação).
>
> **Baseline preservada** em [`raw/research-evidence-live-baseline/`](raw/research-evidence-live-baseline/)
> antes de qualquer correção. Nenhuma correção foi aplicada nesta sprint.

**Configuração:** `AI_PAID_PROVIDERS_ENABLED=true` · `firecrawl_ativo: true` ·
`embeddings_pagos: false` · `llm_key_definida: false` · `AI_PROVIDER=ollama`

**Limites:** 3 buscas · 3 scrapes · **0 chamadas de LLM** · teto US$ 0.50

---

## Resumo executivo

| Caso | Entidade | Status | Fontes | Scrapes | Fatos | Corrob. |
|---|---|---|---:|---:|---:|---:|
| A | Converse | `evidencia_insuficiente` | 10/12 | **0** | 0 | 0 |
| B | Insider Store | `evidencia_insuficiente` | 8/12 | 3 | 0 | 0 |
| C | Reserva | `sucesso` ⚠️ | 11/12 | 3 | **3 (ruins)** | 0 |

**A validação encontrou quatro defeitos reais que os fixtures não revelaram.**
Nenhum deles é falha de infraestrutura — busca e scraping funcionaram. São
falhas de **discernimento**.

---

## CASO A — Converse (movimentos_recentes)

### PLANNING (`planning_mode: heuristica`)
```
Converse notícias
Converse anúncio recente
Converse novidades
```

### SEARCH RESULTS — 12 resultados reais

```
[fashionunited.com.br]  Notícias e arquivo sobre Converse
[portalpopcyber.com]    Converse | Últimas Notícias
[capricho.abril.com.br] Notícias sobre converse - Capricho
[bloomberglinea.com.br] Converse, da Nike, caminha para pior nível em 15 anos
[duckduckgo.com]        Converse Anuncio - Frete Grátis - Mercado Livre     ← ANÚNCIO
[duckduckgo.com]        Converce - Converce On eBay                         ← ANÚNCIO
[converse.com.br]       Lançamentos | Loja Oficial da Converse
[converse.com.br]       Converse All Star Oficial | Compre seu Tenis
```

### 🔴 DEFEITO 1 — Anúncios entram como fonte

Quatro dos doze resultados são **anúncios pagos** do DuckDuckGo, e o parser
extraiu `duckduckgo.com` como domínio (o link é um redirecionador). Eles foram
**aceitos** como fonte.

### 🔴 DEFEITO 2 — Credibilidade sem discriminação

```
fashionunited.com.br    58  media  desconhecido
bloomberglinea.com.br   58  media  imprensa      ← Bloomberg
duckduckgo.com          58  media  desconhecido  ← anúncio
converse.com.br         58  media  desconhecido  ← site OFICIAL
```

**Todas as dez fontes receberam exatamente 58.** Bloomberg, o site oficial da
marca e um anúncio do Mercado Livre são indistinguíveis para o agente.

Duas causas:
- `converse.com.br` não foi reconhecido como oficial — o `site_oficial`
  informado era `converse.com` (sem `.br`)
- a lista de domínios reputados não contém veículos de moda/negócios do
  cenário real

### CONSEQUÊNCIA: gate de custo bloqueou tudo

```
haFonteConfiavel = alguma fonte com score >= 70 → FALSE
→ extração NÃO executada
→ 0 scrapes, 0 fatos
→ status: evidencia_insuficiente
```

**Isto é o fail-safe funcionando.** Diante de fontes que não conseguiu
qualificar, o agente não gastou Firecrawl e não inventou fato. Comportamento
conservador correto — sobre uma avaliação errada.

---

## CASO B — Insider Store (contexto_geral)

### SCRAPING REAL — funcionou

```
firecrawl | 31.541 chars |  5.827ms | frases candidatas: 0 | fatos: 0
firecrawl | 15.599 chars |  4.075ms | frases candidatas: 0 | fatos: 0
firecrawl | 54.557 chars |  1.078ms | frases candidatas: 0 | fatos: 0
```

**101 mil caracteres de conteúdo real coletado. Zero fatos extraídos.**

### 🔴 DEFEITO 3 — Extrator determinístico não encontra fatos em texto real

O extrator exige que uma frase contenha **o nome da entidade** *e* **um verbo
factual** da lista. Em 101 mil caracteres de páginas institucionais reais,
**nenhuma frase** satisfez as duas condições.

Páginas de e-commerce e institucionais escrevem *"Conheça a nova coleção"*, não
*"A Insider Store lançou a nova coleção"*. O sujeito fica implícito.

**Este é o limite da extração sem LLM, medido em dado real.** Não é bug de
implementação — é a estratégia batendo no seu teto.

---

## CASO C — Reserva (contexto_geral) — o mais grave

### SEARCH RESULTS

O nome "Reserva" é ambíguo: marca brasileira de moda × palavra comum em
espanhol/português.

```
✅ reserva.is                                    (marca)
❌ spanishdict.com/translate/reserva             (DICIONÁRIO)
❌ collinsdictionary.com/.../spanish-english/reserva  (DICIONÁRIO)
```

### 🔴 DEFEITO 4 — Entity mismatch não detectado → fatos absurdos

O agente raspou dois **dicionários** e extraiu deles três "fatos":

```
[contexto_empresa] "Affirmative imperative tú conjugation of reservar."
                   fonte: spanishdict.com/translate/reserva

[contexto_empresa] "--- --- Compruebe si su reserva ha sido confirmada
                    por nuestro proveedor."
                   fonte: spanishdict.com/translate/reserva

[contexto_empresa] "Envía un mail a irene@yogadurga.es confirmando tu
                    reserva y asistencia."
                   fonte: spanishdict.com/translate/reserva
```

**Classificação de extração: `UNSUPPORTED` nos três.**

São frases de exemplo gramatical de um dicionário, apresentadas como fatos sobre
uma empresa. A terceira contém inclusive um e-mail de terceiro sem relação
alguma com a entidade.

**E o pacote foi marcado `status: sucesso`.**

### Por que a Entity Resolution não pegou

O `client` de banco não foi passado ao agente nesta execução — sem ele, a etapa
é pulada silenciosamente. E mesmo com ele, a resolução compara contra as
**Partes da base Cross**, não contra o conteúdo das páginas coletadas. Não
existe verificação de que a *página raspada* fala da entidade certa.

---

## Avaliação da extração (§16)

| Caso | Fato | Classificação |
|---|---|---|
| A | — | *nenhum fato produzido* |
| B | — | *nenhum fato produzido* |
| C | "Affirmative imperative tú conjugation…" | **UNSUPPORTED** |
| C | "Compruebe si su reserva ha sido confirmada…" | **UNSUPPORTED** |
| C | "Envía un mail a irene@yogadurga.es…" | **UNSUPPORTED** |

**Nenhum fato aproveitável foi produzido em três casos reais.**

---

## Conflitos reais

**Nenhum conflito real encontrado.** Como nenhum caso produziu fatos válidos
sobre a mesma afirmação, não houve oportunidade de conflito. A mecânica está
coberta pelo teste controlado da AI-02 — não foi inventado conflito para
preencher cenário.

---

## Recência

**Não exercitada.** Nenhum resultado real trouxe `published_at` — o endpoint
HTML do DuckDuckGo não expõe data de publicação, como já registrado na auditoria
de IA. Sem data, a janela temporal não tem sobre o que operar.

**Limitação de infraestrutura, não do agente.**

---

## O que FUNCIONOU

Vale registrar, porque não é pouco:

| Componente | Evidência |
|---|---|
| **Busca real** | 12 resultados por caso, DuckDuckGo, sem chave |
| **Firecrawl real** | 6 páginas raspadas, 6k–54k chars, 1–6s cada |
| **Dedupe** | 2–4 fontes descartadas por caso |
| **Gate de custo** | Caso A: sem fonte confiável → 0 scrapes gastos |
| **Guardrails** | 3 buscas e 3 scrapes por caso, nenhum estouro |
| **Fail-safe** | 2 de 3 casos declararam `evidencia_insuficiente` |
| **Zero LLM paga** | `llm_key_definida: false`, `maxChamadasLlm: 0` |
| **Proveniência** | Todo fato aponta para URL e trecho literal |

---

## Telemetria real

| | Caso A | Caso B | Caso C |
|---|---:|---:|---:|
| Queries | 3 | 3 | 3 |
| Buscas web | 3 | 3 | 3 |
| Scrapes | **0** | 3 | 3 |
| Fontes encontradas | 12 | 12 | 12 |
| Fontes usadas | 10 | 8 | 11 |
| Descartadas | 2 | 4 | 1 |
| Fatos | 0 | 0 | 3 |
| Duração | 862ms | 14,1s | 16,3s |
| Custo em tokens | US$ 0 | US$ 0 | US$ 0 |
| Bloqueios | 0 | 0 | 0 |

**Total: 9 buscas · 6 scrapes · 0 chamadas de LLM · US$ 0 em tokens.**

---

## Tabela de avaliação humana

| Critério | Caso A | Caso B | Caso C |
|---|---|---|---|
| Fontes relevantes? | ⚠️ Parcial — 4 anúncios aceitos | ✅ Sim | ❌ **Não** — 2 dicionários |
| Ruído controlado? | ❌ **Não** — anúncios como fonte | ✅ Sim | ❌ **Não** |
| Fatos sustentados? | — sem fatos | — sem fatos | ❌ **Não** — 3 UNSUPPORTED |
| Datas confiáveis? | ⚠️ Ausentes (sem `published_at`) | ⚠️ Ausentes | ⚠️ Ausentes |
| Descartes coerentes? | ✅ Sim | ✅ Sim | ⚠️ Insuficientes |
| Lacunas reconhecidas? | ✅ Sim | ✅ Sim | ❌ **Não** — disse `sucesso` |
| **Pronto para Entity Intelligence?** | **NÃO** | **NÃO** | **NÃO** |

---

## Conclusão

**O agente coleta bem e julga mal.**

A infraestrutura está sólida: busca real, scraping real, guardrails ativos,
dedupe funcionando, fail-safe acionando, proveniência completa, zero custo de
LLM. Nada disso é hipótese — foi medido.

O que falha é o **discernimento**:

1. **Anúncios entram como fonte** (defeito 1)
2. **Credibilidade não discrimina** — tudo recebe 58 (defeito 2)
3. **Extração sem LLM não acha fatos em texto real** (defeito 3)
4. **Entidade errada não é detectada** — dicionários viraram fatos (defeito 4)

O defeito 4 é o mais grave: o agente entregou `status: sucesso` com três
afirmações sem relação alguma com a entidade. Se o Entity Intelligence
consumisse esse pacote, construiria um perfil sobre conjugação verbal em
espanhol.

**Nenhuma correção foi aplicada.** A instrução §22 pede baseline antes de fix, e
os quatro defeitos exigem decisões que não são minhas: filtrar anúncios muda o
coletor; recalibrar credibilidade muda um componente homologado; extrair fatos de
texto real provavelmente exige LLM — o que reabre a questão de custo.

**Este é o valor da sprint:** os fixtures diziam que o agente estava pronto.
O dado real diz que não está.
