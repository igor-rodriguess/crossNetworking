# Cross Orchestrator — Output Showcase

**Sprint E2E-01** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · Web ao vivo: **DESLIGADA**

```
Paid LLM          = 0
Paid Embeddings   = 0
Live Search       = 0
Firecrawl         = 0
External Cost     = US$ 0

Real AI Validation   = PENDING
Live Web Validation  = PENDING
Nível de validação   = estrutural_e2e
```

> Pergunta do Orchestrator: **"qual agente roda agora, e principalmente qual
> NÃO precisa rodar?"**
> O produto é a jornada completa — com as pausas humanas no lugar certo.

Saída bruta: [`raw/cross-orchestrator-e2e/showcase-run.txt`](raw/cross-orchestrator-e2e/showcase-run.txt).

---

## O plano é determinístico

Duas chamadas com a mesma entrada produzem **exatamente** o mesmo plano:

```
planos idênticos: true
chamadas externas estimadas: 0

 1. research             pular            Perfil consolidado disponível; Evidence bruta não é necessária.
 2. entity_intelligence  reutilizar       Perfil v1 com 2 dia(s).
 3. crossability         executar         Sem análise Crossability válida para o contexto.
 4. matching             executar         Matching é sempre executado por direção (cliente_para_parceiro);
                                          resultado de outra direção não é reaproveitável.
 5. recommendation       executar         Recommendation depende do par source+candidato desta jornada.
 6. human_review         aguardar_humano  Human Gate: a jornada para até decisão humana.
 7. promotion            aguardar_humano  Promoção exige ação humana explícita (AI-07B).
 8. paper                aguardar_humano  Paper segue fluxo humano existente.
 9. score_card           aguardar_humano  Score Card exige Paper aprovado (RN022).
```

Nenhuma LLM decide o próximo passo. Perguntar a um modelo *"qual agente devo
executar agora?"* tornaria o sistema imprevisível e caro sem ganho algum — a
resposta é derivável de regra: existe artefato? está fresco? a direção bate?

**Cada etapa carrega um motivo.** Sem ele, "reutilizada" seria um número sem
explicação, e a economia declarada não poderia ser conferida.

---

## Jornada 1 · cliente → parceiro

```
status:        aguardando_revisao_humana
motivo:        Aguardando decisão humana sobre a hipótese.
recomendação:  criada

 –  1. research             pulada             Perfil consolidado disponível.
 ♻  2. entity_intelligence  reutilizada        Perfil v1 com 2 dia(s).
 ✓  3. crossability         concluida
 ✓  4. matching             concluida
 ✓  5. recommendation       concluida
 ⏸  6. human_review         aguardando_humano  Human Gate: a jornada para.

executados=3  reutilizados=1  pulados=1
llm=0  web=0  firecrawl=0  custo=US$ 0
```

A jornada **para na etapa 6**. As etapas 7–9 nunca foram executadas.

---

## O que o front receberia

```
status:               pronta_para_revisao
nível de sustentação: sustentacao_parcial
confiança:            60
próximo passo:        validar_com_time_cross
perfil do candidato:  v1
evidências de suporte: 3
riscos declarados:     1
questões abertas:      3

hipótese:
  "Existe uma hipótese de conexão entre Cliente j1 e Parceiro j1 no contexto
   de 'ativação cultural', sustentada por convergência em público, território
   de atuação, ativos. A hipótese requer validação humana e não constitui
   avaliação de encaixe comercial."
```

O texto da hipótese **declara a própria limitação**. Não afirma encaixe
comercial — afirma que existe hipótese a ser validada, e por quê.

### Um defeito encontrado ao inspecionar este payload

A primeira execução devolvia `requer_enriquecimento`, confiança **10**, hipótese
`null`. A causa não era falta de dados na plataforma: a jornada construía o
perfil da **origem** mas nunca o do **candidato**, e `evidencias_suporte` é
montada a partir do perfil do candidato.

A recomendação estava, por construção, condenada a ser insuficiente.

A correção reaproveita os sinais que o Matching **já leu** da base interna
(`cross_intelligence.parte_publico` e afins) — sem pesquisa nova, sem custo:

| | Antes | Depois |
|---|---|---|
| status | `requer_enriquecimento` | `pronta_para_revisao` |
| sustentação | `insuficiente` | `parcial` |
| confiança | 10 | **60** |
| evidências de suporte | 0 | 3 |
| hipótese | `null` | texto completo |

Só entram sinais com referência do lado do candidato: um perfil montado com
afirmações sem lastro seria pior do que perfil ausente.

---

## O Human Gate para de verdade

```
resume sem decisão → aguardando_revisao_humana     candidatura: nenhuma
após aprovação     → aguardando_promocao           candidatura: nenhuma  ← aprovar NÃO promove
após promoção      → oportunidade_criada           candidatura: criada

etapas reexecutadas no resume: 0   (antes=6, depois=6)
```

Três estados distintos, três ações humanas distintas. **Aprovar não promove**:
são decisões separadas, e juntá-las faria a aprovação carregar um efeito
operacional que ninguém pediu.

O resume **não reexecuta nada**: 6 etapas antes, 6 depois.

### A verificação de decisão é allow-list

```ts
const APROVACOES = new Set([
  "aprovada_para_revisao_de_oportunidade",
  "aprovada_com_edicoes",
]);
```

Testar apenas por `rejeitada` (deny-list) deixaria `requer_mais_informacao` —
e um `pendente` remanescente — caírem no caminho de aprovação. Exatamente o que
o Human Gate existe para impedir.

| Decisão | Resultado |
|---|---|
| (nenhuma) | `aguardando_revisao_humana` |
| `requer_mais_informacao` | `aguardando_revisao_humana` |
| `rejeitada` | `revisao_rejeitada` (terminal) |
| `aprovada_para_revisao_de_oportunidade` | `aguardando_promocao` |
| + promoção humana explícita | `oportunidade_criada` |

---

## Jornada 2 · parceiro → cliente

```
status: aguardando_revisao_humana
direção do matching: parceiro_para_cliente
```

O Matching **nunca é reutilizado entre direções**. Uma shortlist de
cliente→parceiro não serve para a direção inversa: a direção faz parte da
identidade do resultado, não é um filtro aplicado depois.

---

## Jornada 3 · prospecção do zero

```
status:              aguardando_revisao_humana
origem:              nao_vinculada
trigger:             monitoring_alert (não-humano)
partes antes/depois: 6 / 6              ← nenhuma Parte criada
bloqueios do plano:  Entidade de origem não vinculada a uma Parte:
                     promoção operacional bloqueada até resolução humana.
```

Duas garantias que se sustentam juntas:

1. **Nenhuma Parte é criada automaticamente.** Resolver a identidade de uma
   entidade externa é decisão humana; o sistema declara o bloqueio em vez de
   inventar o vínculo.
2. **Trigger não-humano não dispensa Human Gate.** A jornada nasceu de um alerta
   de Monitoring e mesmo assim parou na revisão. Origem automática pode
   *iniciar*, nunca *aprovar*.

---

## Fail-safe factual

```
status: evidencia_insuficiente   (≠ falha: true)
motivo: Nenhum fato disponível sobre a entidade de origem.
recomendações antes/depois: 3 / 3

 ⛔ 3. crossability    bloqueada   Perfil sem fatos: nenhuma inteligência pode ser sustentada.
 ⛔ 4. matching        bloqueada   Perfil sem fatos: nenhuma inteligência pode ser sustentada.
 ⛔ 5. recommendation  bloqueada   Perfil sem fatos: nenhuma inteligência pode ser sustentada.
```

Sem fato, não há inteligência a sustentar. Continuar produziria hipótese
inventada — pior do que parar.

`evidencia_insuficiente` **não é falha**: é resultado legítimo. Confundir os dois
faria o sistema tentar "recuperar" de algo que funcionou como deveria.

---

## Economia · reuso vs. pipeline ingênuo

```
sem artefatos  → status=aguardando_revisao_humana
                 executados=5  reutilizados=0  pulados=0
com artefatos  → status=aguardando_revisao_humana
                 executados=2  reutilizados=2  pulados=1

research evitados:            1
entity intelligence evitados: 1
crossability evitados:        1
```

**As duas jornadas terminam no mesmo estado.** Isso é o que torna a comparação
honesta: uma jornada que parou cedo executaria menos etapas, mas isso seria
interrupção, não economia.

> **Nota sobre este número.** Na primeira versão do showcase a jornada "sem
> artefatos" executava 1 etapa e parava em `evidencia_insuficiente` — sem
> adaptador de pesquisa, não havia fatos. O "executados=1" parecia eficiência
> e era o fail-safe. Corrigido com um adaptador controlado (zero rede, zero
> custo) para que ambas cheguem ao mesmo ponto final.

`reutilizada` ≠ `pulada`:

| Estado | Significado |
|---|---|
| `reutilizada` | havia artefato válido; foi reaproveitado |
| `pulada` | a etapa nem precisava rodar nesta jornada |
| `bloqueada` | não pôde rodar por falta de sustentação |
| `aguardando_humano` | pausa legítima, não erro |

---

## Zero efeito operacional automático

```
oportunidades criadas pela IA: 0
projetos criados:              0
parcerias criadas:             0
reuniões criadas:              0
avanços de funil:              0
papers aprovados por IA:       0
```

A única oportunidade criada em todo o showcase veio da **promoção humana
explícita** da Jornada 1 — com `frenteOportunidadeId` e identificação de quem
promoveu.

---

## Perguntas de validação

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | O plano é determinístico? | **Sim** — mesma entrada, plano idêntico |
| 2 | Alguma LLM decide o próximo agente? | **Não** |
| 3 | Reexecuta agente com artefato válido? | **Não** — 3 evitados |
| 4 | Matching é reutilizado entre direções? | **Não** — direção é identidade |
| 5 | O Human Gate para de verdade? | **Sim** — 3 estados distintos |
| 6 | Aprovar promove? | **Não** — ação separada |
| 7 | Resume reexecuta etapas? | **Não** — 0 reexecutadas |
| 8 | Cria Parte automaticamente? | **Não** — 6/6 partes |
| 9 | Trigger automático dispensa gate? | **Não** |
| 10 | Sem fatos, inventa hipótese? | **Não** — `evidencia_insuficiente` |
| 11 | Usa IA paga ou web ao vivo? | **Não** — US$ 0 |
| 12 | Efeito operacional automático? | **Nenhum** |

---

## Limitações

1. **`REAL_AI_VALIDATION = PENDING`** — o kill switch está ativo, então as seis
   dimensões do Crossability retornam `operation_not_allowed` e saem como
   `insuficiente` / `indeterminado` com confiança 0. A estrutura da jornada está
   validada; o **conteúdo interpretativo** não. Esta é a limitação mais
   relevante desta Sprint: o Orchestrator entrega inteligência estruturalmente
   correta porém vazia enquanto o modelo real não for ligado.

2. **`LIVE_WEB_VALIDATION = PENDING`** — Research roda por adaptador controlado.

3. **Perfil do candidato vem de sinais internos**, não de uma execução do Entity
   Intelligence sobre evidência externa. É reaproveitamento honesto do que o
   Matching já leu, e o perfil declara essa origem — mas é mais pobre do que um
   perfil pesquisado.

4. **Sem rota HTTP e sem scheduler.** O motor é chamável (`executarJourney`,
   `retomarJourney`), mas nenhuma rota o expõe ainda.

5. **`Paper` e `Score Card` são etapas planejadas, não executadas.** Seguem o
   fluxo humano existente (AI-07B); o Orchestrator apenas as declara como espera.

6. **Concorrência de resume não exercitada sob carga.** A coluna `versao` existe
   para *optimistic locking*, mas dois resumes simultâneos não foram testados em
   corrida real.
