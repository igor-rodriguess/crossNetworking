# 02 — Modelo de Oportunidade e Funil

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

---

## 1. Funil atual — verificado

**Não é preciso inventar estados: já existem 16.** Dez vieram do seed original
(migration 019) e seis da migration 050, que os alinhou à planilha real de
trabalho da Cross.

| # | Código | Nome | Origem |
|---:|---|---|---|
| 1 | `identificada` | Identificada | 019 |
| 2 | `em_analise` | Em análise | 019 |
| 3 | `recomendada` | Recomendada | 019 |
| 4 | `apresentada` | Apresentada | 019 |
| 11 | `abrir_frente` | Abrir frente | 050 |
| 12 | `frente_aberta` | Frente aberta | 050 |
| 13 | `aguardando_parceiro` | Frente aberta · aguardando parceiro | 050 |
| 14 | `validar_com_cliente` | Validar com o cliente | 050 |
| 15 | `aguardando_ok_cliente` | Aguardando OK do cliente | 050 |
| 16 | `parceria_andamento` | Parceria em andamento | 050 |
| 5 | `aprovada` | Aprovada | 019 |
| 8 | `em_negociacao` | Em negociação | 019 |
| 9 | `stand_by` | Stand-by | 019 |
| 6 | `recusada_cliente` | Recusada pelo cliente | 019 |
| 7 | `recusada_parceiro` | Recusada pelo parceiro | 019 |
| 10 | `encerrada` | Encerrada | 019 |

O comentário da migration 050 revela a lógica: os estados existentes descrevem a
**posição no funil**; os novos descrevem **de quem é a próxima ação** — *"saber
se a bola está com a Cross, com o cliente ou com a marca parceira."*

Isso é mais maduro do que a lista proposta na §11 do briefing.

---

## 2. Comparação com a lista proposta

A §11 pediu explicitamente para **não adotar a lista cegamente**. Comparando:

| Estado proposto | Já existe? | Equivalente atual |
|---|---|---|
| DESCOBERTA | ✅ | `identificada` |
| EM ANÁLISE | ✅ | `em_analise` |
| VALIDADA | ✅ | `recomendada` (pós-Human Gate) |
| ABORDAGEM | ✅ | `abrir_frente` |
| AQUECIMENTO | ✅ | `frente_aberta` / `aguardando_parceiro` |
| REUNIÃO AGENDADA | ❌ | — |
| REUNIÃO REALIZADA | ❌ | — |
| NEGOCIAÇÃO | ✅ | `em_negociacao` |
| CONVERTIDA | ⚠️ | `aprovada` (sem marco de conversão explícito) |
| DESCARTADA | ✅ | `recusada_cliente` / `recusada_parceiro` / `encerrada` |

**Oito dos dez já existem.** Os dois ausentes são de reunião — e reunião é
justamente o bloqueador estrutural (doc 03).

### Recomendação: **não adicionar estados de reunião ao funil**

Motivo: reunião é um **evento**, não um estágio. Uma oportunidade pode ter
várias reuniões e continuar em `frente_aberta`. Modelar reunião como estado do
funil confundiria duas dimensões e forçaria transições artificiais.

O dado "tem reunião agendada" deve vir da **entidade Reunião** vinculada à
oportunidade, exibida ao lado do estágio — não dentro dele.

### Estados finais recomendados: **os 16 atuais, sem alteração**

Nenhum estado novo. Nenhum removido. É a menor mudança estrutural possível, como
a §11 pediu, e preserva os dados das 65 candidaturas em operação.

---

## 3. Transições e estados terminais

```
                    ┌─────────────────┐
                    │  identificada   │ ◀── origem: IA | pessoa | reunião | busca
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │   em_analise    │ ◀── Crossability + Score Card
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │   recomendada   │ ◀══ HUMAN GATE (IA propõe → humano valida)
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
     ┌──────────────│  abrir_frente   │
     │              └────────┬────────┘
     │                       ▼
     │              ┌─────────────────┐      ┌──────────────────────┐
     │              │  frente_aberta  │◀────▶│ aguardando_parceiro  │
     │              └────────┬────────┘      └──────────────────────┘
     │                       ▼
     │              ┌──────────────────────┐  ┌────────────────────────┐
     │              │ validar_com_cliente  │─▶│ aguardando_ok_cliente  │
     │              └──────────┬───────────┘  └───────────┬────────────┘
     │                         ▼                          ▼
     │              ┌─────────────────┐          ┌─────────────────┐
     │              │  apresentada    │─────────▶│  em_negociacao  │
     │              └────────┬────────┘          └────────┬────────┘
     │                       │                            │
     │                       └────────────┬───────────────┘
     │                                    ▼
     │                           ┌─────────────────┐
     │                           │    aprovada     │ ══▶ CONVERSÃO → PROJETO
     │                           └────────┬────────┘
     │                                    ▼
     │                        ┌──────────────────────┐
     │                        │ parceria_andamento   │
     │                        └──────────────────────┘
     │
     └──▶ stand_by ⇄ (retorna a qualquer estágio ativo)

   TERMINAIS: recusada_cliente · recusada_parceiro · encerrada
```

**Estados terminais (3):** `recusada_cliente`, `recusada_parceiro`, `encerrada`.
De um terminal não se sai — reabrir é criar nova oportunidade, preservando o
histórico do descarte (que é informação, conforme a visão do produto).

**Estado reversível:** `stand_by` — pausa que retorna ao estágio anterior.

**Marco de conversão:** `aprovada`. É aqui que a Oportunidade vira Projeto.

---

## 4. Quem pode alterar — e onde entra o Human Gate

Este é o núcleo do ADR-003.

| Transição | Quem executa | Human Gate |
|---|---|---|
| → `identificada` | **IA ou humano** | Não — criar rascunho não move nada |
| `identificada` → `em_analise` | **IA** | Não — analisar não é decidir |
| `em_analise` → `recomendada` | **HUMANO** | **SIM — obrigatório** |
| `recomendada` → `abrir_frente` em diante | **HUMANO** | Não (já validado) |
| Qualquer → `aprovada` | **HUMANO** | **SIM — conversão** |
| Qualquer → terminal | **HUMANO** | Registrar motivo |

**Regra formal (ADR-003):**

> A IA pode **criar** uma oportunidade em `identificada` e **movê-la** até
> `em_analise`. Qualquer transição a partir de `recomendada` exige decisão
> humana registrada em `historico_candidatura` com `responsavel_id`.
> A IA pode **sugerir** a próxima transição; sugerir não é executar.

A estrutura para isso **já existe**: `historico_candidatura` tem
`status_anterior_id`, `status_novo_id`, `responsavel_id`, `justificativa` e
`contexto JSONB`. Uma sugestão de IA pode viver em `contexto` sem alterar o
status — exatamente o que a §11 pede.

---

## 5. Impacto no banco

| Alteração | Tipo | Migration? |
|---|---|---|
| Estados do funil | **Nenhuma** | Não |
| Transições | Regra de serviço | Não |
| Sugestão de IA em `contexto` | Uso de coluna existente | Não |
| `candidatura_parceiro.origem` | Coluna aditiva | **Sim** (futura) |
| `frente_oportunidade.projeto_id` → nullable | `DROP NOT NULL` | **Sim** (futura) |
| `candidatura_parceiro.cliente_cross_id` | Coluna aditiva nullable | **Sim** (futura) |

**Três alterações, todas aditivas ou relaxamento de restrição.** Nenhuma
destrutiva. Nenhum dado existente precisa mudar.

> `DROP NOT NULL` merece atenção: é irreversível na prática se dados nulos forem
> gravados (o rollback exigiria preencher ou remover essas linhas). Deve ser
> aplicada só quando o serviço estiver pronto para tratar projeto ausente.

---

## 6. Funil e interface (§12)

Três alternativas foram pedidas. **Recomendação: C — Dashboard + Oportunidades.**

| Alternativa | Avaliação |
|---|---|
| **A. Página própria (`/funil`)** | ❌ A página já está órfã (Sprint 0A): 379 linhas sem link no menu. Manter uma página dedicada reforça a leitura de CRM, contrária à visão |
| **B. Dentro de Oportunidades** | ⚠️ Bom, mas insuficiente — o funil também responde "o que precisa da minha atenção", que é pergunta de dashboard |
| **C. Dashboard + Oportunidades** | ✅ **Recomendada** |

**Como fica:**

- **Dashboard** — visão agregada: quantas oportunidades em cada estágio, quais
  travadas, de quem é a próxima ação. Responde *"o que precisa da minha
  atenção?"*
- **Oportunidades** — visão operacional: lista filtrável por estágio, com a
  movimentação acontecendo na própria oportunidade

O produto é inteligência, não CRM: o funil deixa de ser destino de navegação e
passa a ser **atributo da oportunidade**, visível onde a decisão acontece.

`/funil` sai do roteamento principal — mas só depois de confirmar desuso
(pendência B.4 da Sprint 0A).

---

## 7. Relação com `oportunidade_ia`

Vale registrar por que **não** consolidar as duas tabelas:

| | `cross_ai.oportunidade_ia` | `cross_projects.candidatura_parceiro` |
|---|---|---|
| Natureza | Rascunho de IA | Oportunidade de domínio |
| Momento | **Antes** do Human Gate | **Depois** do Human Gate |
| Vínculo com Parte | Texto (`parceiro_nome`) | FK (`parte_id`) |
| Permissão de escrita | `cross_app` insere | Fluxo de domínio |
| Regras de negócio | Nenhuma | RN022, RN023, RN026 |

São **estágios diferentes do mesmo conceito**, e a separação é uma proteção: o
rascunho de IA não pode acionar as regras de domínio antes da validação humana.
Consolidá-las eliminaria essa barreira.

**Fluxo correto:**

```
pipeline de IA ──▶ oportunidade_ia (rascunho, sem FK)
                          │
                          ▼
                   ═══ HUMAN GATE ═══
                          │
                          ▼
            candidatura_parceiro (domínio, com FK, com regras)
```

Hoje o `decidirHumanGate()` só promove análises Crossability para candidatura
existente. Promover uma `oportunidade_ia` a `candidatura_parceiro` **ainda não
existe** — é uma lacuna de implementação registrada no roadmap.

**Continua em:** `03-meeting-domain-evolution.md`.
