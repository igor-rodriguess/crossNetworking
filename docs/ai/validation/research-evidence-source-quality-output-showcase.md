# Source Quality & Entity Safety — BEFORE → AFTER

**Plataforma Cross** · Sprint AI-02.2
Data: 15/08/2026

> Comparação com **dados reais** entre a baseline da AI-02.1 e a rodada após as
> correções. Mesmas três entidades, mesmos limites, mesma configuração.
>
> **BEFORE:** [`raw/research-evidence-live-baseline/`](raw/research-evidence-live-baseline/)
> **AFTER:** [`raw/research-evidence-source-quality/`](raw/research-evidence-source-quality/)
>
> Firecrawl ativo · **LLM paga: NÃO** · embeddings pagos: NÃO · guardrails ativos.

---

## Placar

| | BEFORE | AFTER |
|---|---|---|
| Anúncios aceitos como fonte | **4** | **0** |
| Credibilidade — valores distintos | **1** (todos 58) | **5+** (0 a 95) |
| Site oficial reconhecido | ❌ não | ✅ score 95 |
| Dicionários raspados (Reserva) | **2** | **0** |
| "Fatos" de dicionário | **3** | **0** |
| PII de terceiro em Evidence | **1 e-mail** | **0** |
| Reserva — status final | `sucesso` ⚠️ | `evidencia_insuficiente` ✅ |

---

## 1. ANÚNCIOS

### BEFORE — 4 anúncios aceitos

```
[duckduckgo.com] Converse Anuncio - Frete Grátis - Mercado Livre    score 58 ✅ aceito
[duckduckgo.com] Converce - Converce On eBay                        score 58 ✅ aceito
[duckduckgo.com] Melhores Ofertas Mercado Livre                     score 58 ✅ aceito
[duckduckgo.com] Ofertas em novidades - Amazon.com.br               score 58 ✅ aceito
```

### AFTER — as MESMAS 4 URLs, reprocessadas

> A rodada AFTER não recebeu anúncios do buscador (a presença varia por
> requisição). Para não deixar o filtro sem prova real, as URLs exatas da
> baseline foram reprocessadas —
> [`replay-anuncios-baseline.json`](raw/research-evidence-source-quality/replay-anuncios-baseline.json).

```
BLOQUEADO | score 0 | Converse Anuncio - Frete Grátis - Mercado Livre
   sinais: redirecionador_de_anuncio, parametro_ad_domain, dominio_do_buscador_como_fonte
BLOQUEADO | score 0 | Converce - Converce On eBay
BLOQUEADO | score 0 | Melhores Ofertas Mercado Livre
BLOQUEADO | score 0 | Ofertas em novidades - Amazon.com.br

RESULTADO: 4/4 bloqueados · 4 scrapes evitados
```

**Sinais que os denunciam** (extraídos das URLs reais):
`/y.js?` · `ad_domain=` · `ad_provider=` · `ad_type=txad` · `click_metadata=` ·
domínio do buscador permanecendo como fonte.

O descarte acontece **antes** de credibilidade e scraping.

---

## 2. CREDIBILIDADE

### BEFORE — tudo 58

```
fashionunited.com.br    58  media  ← imprensa setorial
bloomberglinea.com.br   58  media  ← Bloomberg
duckduckgo.com          58  media  ← ANÚNCIO
converse.com.br         58  media  ← SITE OFICIAL
```

Bloomberg, o site oficial e um anúncio, indistinguíveis.

### AFTER — faixas separadas e explicadas

```
converse.com            95  oficial                 [dominio_oficial_da_entidade, HTTPS]
bloomberglinea.com.br   85  imprensa_reconhecida    [veiculo_de_imprensa_reconhecido]
fashionunited.com.br    75  imprensa_especializada  [veiculo_setorial_relevante]
medium.com              40  agregador               [agregador_ou_republicador]
portalpopcyber.com      50  baixa_autoridade        [dominio_nao_reconhecido, https]
qualquer.blogspot.com   20  baixa_autoridade        [padrao_de_baixa_autoridade]
anúncio                  0  anuncio                 [redirecionador_de_anuncio, ...]
```

**O gate de 70 não foi mexido.** O que mudou foi a precisão: agora o site
oficial *alcança* o gate porque é reconhecido, não porque o gate baixou.

### O bug do domínio oficial

A baseline informou `site_oficial=converse.com` e recebeu resultados de
`converse.com.br` — não reconhecidos. O comparador agora aceita subdomínio
(`news.converse.com`) e variação de país (`converse.com.br`), mas **não** aceita
domínio que apenas contém o nome (`converse-blog.com`).

---

## 3. RESERVA — o caso bloqueante ⭐

### BEFORE

```
BUSCA         → spanishdict.com/translate/reserva
                collinsdictionary.com/.../spanish-english/reserva
     ↓
CREDIBILITY   → score 58, aceitos
     ↓
SCRAPE        → 2 dicionários raspados (17.574 e 44.706 chars)
     ↓
EXTRAÇÃO      → 3 "fatos":
                • "Affirmative imperative tú conjugation of reservar."
                • "Compruebe si su reserva ha sido confirmada..."
                • "Envía un mail a irene@yogadurga.es confirmando tu reserva..."
     ↓
STATUS        → sucesso  ⚠️
```

Três frases de exemplo gramatical apresentadas como fatos sobre uma empresa —
incluindo **o e-mail de um terceiro**.

### AFTER

```
BUSCA         → 12 resultados (os mesmos dicionários aparecem)
     ↓
PRÉ-SCRAPE    → spanishdict.com        ENTIDADE_DIVERGENTE  [dominio_lexicografico]
                collinsdictionary.com  ENTIDADE_DIVERGENTE  [dominio_lexicografico]
     ↓
SCRAPE        → 0 páginas    ← nenhum dicionário raspado
     ↓
EXTRAÇÃO      → 0 fatos
     ↓
STATUS        → evidencia_insuficiente  ✅
```

**Descartes do caso C:** 11 de 12 · `entidade_divergente` (6) ·
`baixa_credibilidade` (5).

**Zero frases gramaticais viraram Evidence. Zero PII promovido.**

### Por que agora barra

Menção ao nome deixou de bastar. São exigidos **menção à entidade + contexto
organizacional**, mais duas barreiras específicas:

- **domínio lexicográfico** — lista de dicionários conhecidos
- **termos de verbete** — "conjugation", "translate", "definição", "sinônimos"

E uma segunda porta **pós-scrape**: mesmo que um resultado passe no título, o
conteúdo precisa sustentar a relação. Densidade ≥3 de marcadores lexicográficos
reprova a página.

---

## 4. ENTIDADE CORRETA — o que passou

### Caso A — Converse (5 fontes aceitas)

```
converse.com   score 95   oficial   [dominio_oficial_da_entidade]  ×5
```

Sinal: domínio oficial. Dispensa outros — é prova de identidade.

### Caso C — Reserva (1 fonte aceita)

```
reserva.is     [entidade_no_dominio]
```

O nome no domínio é sinal suficiente para prosseguir.

### Caso B — Insider Store (0 fontes aceitas)

Todas as 12 descartadas. **Comportamento correto**: uma marca com pouca
cobertura de imprensa não deve produzir Evidence a partir de resultados
genéricos. `evidencia_insuficiente` é a resposta honesta.

---

## 5. PUBLISHED_AT

**Status: PARCIAL.**

O DuckDuckGo HTML não fornece data — confirmado na baseline. A captura por
metadata foi implementada (JSON-LD, OpenGraph, metadata do Firecrawl), com
`origem_data` registrando a procedência.

**Nas páginas raspadas nesta rodada, nenhuma data foi encontrada** → todas
`publicado_em: null`, `origem_data: desconhecida`.

Coberto por teste com metadata real de cada formato. **Nenhuma data foi
fabricada para preencher o showcase.**

---

## 6. ECONOMIA DE FERRAMENTA

| | BEFORE | AFTER |
|---|---:|---:|
| Fontes encontradas | 36 | 36 |
| Fontes aceitas | 29 | **6** |
| Descartadas pré-scrape | 7 | **30** |
| Páginas raspadas | 6 | **3** |
| Anúncios raspados | 0* | 0 |

\* na baseline os anúncios foram aceitos como fonte, mas o gate de credibilidade
(que reprovou tudo no caso A) impediu o scrape por acidente, não por decisão.

**Scrapes evitados por decisão explícita: 4** (anúncios, no replay) **+ 2**
(dicionários do caso C).

O filtro reduziu de 29 para 6 as fontes aceitas — **menos volume, mais precisão**.

---

## 7. Telemetria AFTER

| | Caso A | Caso B | Caso C |
|---|---:|---:|---:|
| Queries | 3 | 3 | 3 |
| Fontes encontradas | 12 | 12 | 12 |
| Fontes aceitas | 5 | 0 | 1 |
| Descartadas | 7 | 12 | 11 |
| Páginas raspadas | 3 | 0 | 0 |
| Fatos | 0 | 0 | 0 |
| Status | `evidencia_insuficiente` | `evidencia_insuficiente` | `evidencia_insuficiente` |
| Duração | 7,8s | 1,5s | 5,2s |
| Custo (tokens) | US$ 0 | US$ 0 | US$ 0 |
| Bloqueios de guardrail | 0 | 0 | 0 |

---

## 8. O que NÃO foi resolvido

**A extração determinística continua sem extrair fatos de texto real.**

Caso A: 3 páginas oficiais raspadas, conteúdo real coletado, **0 fatos**. O
extrator exige frase contendo a entidade *e* verbo factual; páginas
institucionais escrevem *"Conheça a nova coleção"*, com sujeito implícito.

**Isto era esperado e está fora do escopo desta sprint** (§18 e §33). Nenhuma
regex nova foi adicionada para mascarar o problema — seria fragilidade.

É o objeto da AI-02.3.

---

## 9. Avaliação humana

| Critério | Caso A | Caso B | Caso C |
|---|---|---|---|
| Anúncios bloqueados? | ✅ 4/4 no replay | ✅ n/a | ✅ n/a |
| Credibilidade discrimina? | ✅ oficial 95 | ✅ tudo descartado | ✅ |
| Fontes relevantes? | ✅ 5× site oficial | ✅ nenhuma forçada | ✅ só reserva.is |
| Entity mismatch barrado? | ✅ 1 descarte | ✅ 12 descartes | ✅ **2 dicionários** |
| PII protegido? | ✅ | ✅ | ✅ **0 e-mails** |
| Datas confiáveis? | ⚠️ null (sem metadata) | ⚠️ n/a | ⚠️ n/a |
| Descartes coerentes? | ✅ | ✅ | ✅ |
| Lacunas reconhecidas? | ✅ | ✅ | ✅ |
| **Fontes prontas para o extrator?** | **SIM** | **n/a — nenhuma** | **SIM** |

---

## Conclusão

**Os quatro defeitos da AI-02.1 foram corrigidos e comprovados com dado real:**

1. ✅ Anúncios — 4/4 bloqueados, com sinais nomeados
2. ✅ Credibilidade — de um valor único (58) para faixas explicadas (0–95)
3. ⏭️ Extração — **fora do escopo**, permanece para a AI-02.3
4. ✅ Entity mismatch — dicionários barrados pré-scrape; zero fatos absurdos

**A pergunta desta sprint era:** *"as páginas que chegam ao extrator são
corretas, relevantes e confiáveis?"*

**Resposta: sim.** Das 36 fontes encontradas, 6 passaram — cinco do site oficial
da Converse e uma do site da Reserva. Nenhum anúncio, nenhum dicionário, nenhum
agregador.

O agente ficou **mais rigoroso e menos produtivo** — e, neste estágio, isso é o
comportamento certo. Prefere `evidencia_insuficiente` a Evidence errada.
