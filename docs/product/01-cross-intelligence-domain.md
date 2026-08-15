# 01 — Modelo de Domínio da Cross Intelligence

**Plataforma Cross** · Sprint 0B — Consolidação de domínio
Data: 07/08/2026

> Documento de decisão de produto. Nenhum código foi alterado, nenhuma migration
> executada. As estruturas citadas foram verificadas diretamente nas migrations.

---

## Conclusão principal

**O modelo atual suporta a Cross Intelligence com muito menos mudança do que se
supunha.** Três estruturas que pareciam obstáculos já estão corretas:

| Estrutura | Situação verificada |
|---|---|
| `cross_core.parte_papel` | Papéis com vigência — uma Parte já pode ser cliente e parceira |
| `cross_commercial.cliente_cross.parte_id` | Cliente **já é** uma Parte, não entidade duplicada |
| `cross_projects.status_candidatura` | **16 estados** de funil já cadastrados |

O trabalho real de domínio se concentra em **dois pontos**: reunião presa a
`parceria_id` e a hierarquia obrigatória `projeto → frente → candidatura`.

---

## 1. Empresa / Parte

### Situação atual

```sql
cross_core.parte            -- identidade única
cross_core.organizacao      -- especialização
cross_core.pessoa           -- especialização
cross_core.parte_papel      -- papel COM VIGÊNCIA (parte_id, papel_id, vigência)
```

### Avaliação: **JÁ ATENDE — nenhuma mudança necessária**

O requisito da §7 do briefing — *"evitar duplicar a mesma organização apenas
porque seu papel mudou"* — já está resolvido. `parte_papel` associa papéis a uma
Parte com vigência temporal, então Converse pode ser simultaneamente pesquisada,
prospect, parceira e futura cliente **sem duplicação**.

Isso é confirmado pela operação real: as migrations 047, 048 e 049
(`aramis_marca_cliente`, `grupo_aramis_papel_cliente`,
`cliente_papel_sincronizado`) mostram que o mecanismo já foi exercitado para
sincronizar papel de cliente numa Parte existente.

**Dívida conhecida (Sprint 0A §G):** `Aramis` e `Grupo Aramis` existem como
clientes distintos. É **duplicação de dado**, não falha de modelo — o modelo
permite a unificação; falta a decisão operacional.

---

## 2. Cliente Cross

### Situação atual

```sql
cross_commercial.cliente_cross (
    parte_id UUID NOT NULL REFERENCES cross_core.parte(id),
    responsavel_conta_id, status_cliente_id, inicio_relacionamento, ...
)
```

### Avaliação: **JÁ ATENDE — nenhuma mudança necessária**

O requisito da §8 — *"Cliente NÃO deve ser uma entidade duplicada independente
da empresa"* — está satisfeito. `cliente_cross` é o **relacionamento comercial**
que pendura numa Parte, carregando o que só existe nesse papel (responsável,
status, início, contratos). A identidade permanece em `cross_core.parte`.

Este é o padrão correto e deve ser preservado como referência para o modelo de
Oportunidade.

---

## 3. Oportunidade / Prospecção — o ponto central

### Situação atual

```
projeto (cliente_cross_id obrigatório)
   └── frente_oportunidade (projeto_id obrigatório)
          └── candidatura_parceiro (frente_id + parte_id + status)
                 └── historico_candidatura (status_anterior, status_novo, responsavel, justificativa)

cross_ai.oportunidade_ia (cliente_nome TEXTO, sem FK para parte)
```

### Avaliação: **`candidatura_parceiro` JÁ É a Oportunidade** — precisa evoluir, não ser criada

Comparando o que a §9 exige com o que existe:

| Requisito da Oportunidade | Onde já está | Situação |
|---|---|---|
| Partes envolvidas | `candidatura_parceiro.parte_id` | ✅ |
| Cliente relacionado | via `frente → projeto → cliente_cross` | ⚠️ indireto |
| Estágio | `status_candidatura_id` (16 estados) | ✅ |
| Histórico | `historico_candidatura` (com autor e justificativa) | ✅ |
| Racional | `observacoes` + análises vinculadas | ⚠️ parcial |
| Crossability | `cross_methodologies.analise_crossability` | ✅ |
| Score Card | `avaliacao_score_card` | ✅ |
| Evidências | `oportunidade_ia.fontes` | ⚠️ em tabela paralela |
| Reuniões | — | ❌ bloqueado (ver doc 03) |
| Próxima ação | status operacionais (migration 050) | ✅ |
| Decisões humanas | `decisao` + auditoria | ✅ |
| **Origem** | — | ❌ não registrada |

**Duas lacunas reais**, e ambas são pequenas:

**Lacuna 1 — Origem não registrada.** A §9 exige saber se a oportunidade nasceu
de IA, pessoa, reunião, busca interna, cliente, parceiro, artista ou Big Moment.
Hoje não há coluna para isso. É uma coluna nova, aditiva.

**Lacuna 2 — Projeto obrigatório.** `frente_oportunidade.projeto_id` é
`NOT NULL`, e `projeto.cliente_cross_id` é `NOT NULL`. Consequência: **toda
candidatura exige um projeto e um cliente**. Isso quebra as jornadas B e C, onde
a oportunidade nasce sem cliente definido.

### Decisão recomendada: evoluir `candidatura_parceiro`, não criar tabela

Motivos:

1. **Já carrega os dados reais** — 65 candidaturas da operação Aramis
2. **Já tem o histórico** com autor e justificativa (requisito de Human Gate)
3. **Já está ligada** a Crossability, Score Card e decisões (RN022/RN023)
4. **Criar tabela nova** significaria migrar 65 registros e duplicar as regras
   de negócio protegidas por trigger

**Alteração mínima proposta** (não executar agora):

- `candidatura_parceiro.origem` — coluna nova, aditiva, com default `manual`
- `frente_oportunidade.projeto_id` → **nullable**, permitindo oportunidade sem
  projeto
- `candidatura_parceiro.cliente_cross_id` — coluna nova **nullable**, para
  vínculo direto quando o cliente é conhecido sem passar por projeto

E `cross_ai.oportunidade_ia` permanece como está: é a **camada de rascunho de
IA** (pré-Human Gate), não a oportunidade de domínio. A promoção via Human Gate
é que cria/atualiza a `candidatura_parceiro`. Essa separação é correta e deve
ser preservada — ver ADR-001.

---

## 4. Projeto

### Situação atual

`projeto` tem `cliente_cross_id` obrigatório, objetivo, datas e status. Os
registros reais (`ARAMIS`, `URBAN`, `ARAMIS NEXT`) são **contêineres por marca**,
não iniciativas com prazo (SAD §3.1).

### Avaliação: **PRECISA EVOLUIR de significado, não de estrutura**

A §10 define Projeto como *"iniciativa que já avançou além da hipótese de
prospecção e foi consolidada"*. A estrutura atual já comporta isso — tem
objetivo, datas, status e cliente. O que muda é **quando** um projeto é criado.

### Regra de conversão proposta

> **Uma Oportunidade vira Projeto quando a candidatura atinge status `aprovada`
> e existe decisão humana registrada.**

Isto não é invenção: RN026 já exige *"decisão aprovada e Paper validado"* para
criar parceria. A regra proposta apenas **antecipa o marco** e o nomeia:

```
candidatura (oportunidade)
    │  status = 'aprovada'  +  decisão humana registrada
    ▼
CONVERSÃO  ────────▶  projeto (iniciativa consolidada)
    │
    │  RN026: decisão aprovada + Paper validado
    ▼
parceria (contrato, contrapartidas, execução)
```

**Consequência importante:** o projeto deixa de ser o **ponto de partida**
(criado antes de qualquer análise) e passa a ser o **resultado** de uma
oportunidade validada. A estrutura não muda; a ordem de criação sim.

**Compatibilidade com os dados atuais:** os 3 projetos existentes continuam
válidos como contêineres. Não é preciso migrá-los. Novas oportunidades é que
nascerão sem projeto.

---

## 5. Reunião

Ver documento dedicado: `03-meeting-domain-evolution.md`.

Resumo: `cross_execution.reuniao.parceria_id` é `NOT NULL` com FK para
`cross_partnerships.parceria`. **É o único bloqueador estrutural real** desta
sprint — impede a jornada B.

---

## 6. Entity Intelligence

### Situação atual

```sql
cross_intelligence.*  -- perfil estratégico, ativos, públicos, territórios, praças
```
38 rotas, tudo vinculado a `parte_id`.

### Avaliação: **JÁ ATENDE**

É exatamente a Entity Intelligence da arquitetura alvo. Vinculada a Parte, com
vigência onde aplicável. Nenhuma mudança estrutural necessária.

**O que falta é operacional, não estrutural:** um caminho para a IA propor
atualização de Entity Intelligence passando por Human Gate. Hoje
`part-enrichment.agent` escreve, mas não passa por `decidirHumanGate()` — a
auditoria de IA (doc 02 §11) registrou isso como ponto a auditar.

---

## 7. Mapa das entidades centrais (§26 do briefing)

| Entidade | Situação | Tabelas atuais |
|---|---|---|
| Parte / Empresa | **EXISTE** | `cross_core.parte`, `organizacao`, `pessoa`, `parte_papel` |
| Cliente | **EXISTE** | `cross_commercial.cliente_cross` (via `parte_id`) |
| Entity Intelligence | **EXISTE** | `cross_intelligence.*` |
| Oportunidade / Prospecção | **EXISTE COM OUTRO NOME** | `cross_projects.candidatura_parceiro` |
| Funil | **EXISTE** | `status_candidatura` (16), `historico_candidatura` |
| Projeto | **EXISTE — muda de significado** | `cross_projects.projeto` |
| Reunião | **PRECISA EVOLUIR** | `cross_execution.reuniao` (presa a parceria) |
| Evidence | **PARCIAL** | `oportunidade_ia.fontes`, `cross_governance.*` |
| Knowledge Reference | **PRECISA SER CRIADA** | — (ver doc 05) |
| Crossability Analysis | **EXISTE** | `cross_methodologies.analise_crossability` |
| Cross Score Card | **EXISTE** | `modelo_score_card`, `avaliacao_score_card` |
| Agent Run | **EXISTE** | `cross_ai.execucao_agente`, `tarefa_pipeline` |
| Human Review | **PARCIAL** | `oportunidade_ia.status`, `decisao`, auditoria |
| Documento | **EXISTE** | `cross_core.documento` |
| Artista | **EXISTE** | `parte` + `parte_papel` + `cross_intelligence` |
| Big Moment | **PARCIAL** | sem estrutura própria; hoje na interface |
| Cross Memory | **EXISTE DISPERSO** | `execucao_agente`, `documento`, `historico_*`, auditoria |
| Cross Knowledge | **PRECISA SER CRIADA** | `documento_rag` existe, sem validação nem versão |

**Contagem:** 11 existem · 4 parciais · 1 evolui · 2 a criar.

---

## 8. O que NÃO muda

Registrado para evitar retrabalho:

- `cross_core.parte` e `parte_papel` — modelo de identidade e papéis
- `cross_commercial.cliente_cross` — relacionamento comercial
- `cross_intelligence.*` — Entity Intelligence
- `cross_methodologies.*` — Crossability, Paper, Score Card (RN022/RN023)
- `cross_governance.auditoria` — trilha imutável (RN037)
- Autenticação, autorização por persona, escopo por cliente
- `cross_ai.*` — toda a camada de agentes e o hardening da etapa anterior

**Continua em:** `02-opportunity-funnel-model.md`.
