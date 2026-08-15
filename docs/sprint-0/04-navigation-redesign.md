# 04 — Redesenho da Navegação

**Plataforma Cross** · Sprint 0
Data: 07/08/2026

---

## 1. Sitemap atual

Extraído de `frontend/src/components/AppShell.tsx` (grupos e itens) e
`frontend/src/App.tsx` (rotas registradas).

```
Operar hoje
└── /                      Central de operação        (Dashboard.tsx, 307)

Inteligência Cross
├── /oportunidades         Oportunidades de IA        (236)
└── /conhecimento          Relatórios & base RAG      (112)

Descobrir
├── /partes                Relacionamentos            (276)
├── /marcas                Mapa de oportunidades      (122)
└── /artistas              Artistas & momentos        (402)

Estruturar
├── /projetos              Projetos & briefings       (238)
└── /frentes               Mapeamento de oportunidades (291)

Avaliar & decidir
├── /criterios             Critérios & pesos          (235)
└── /ranking               Ranking & decisões         (150)

Executar & medir
├── /cronograma            Cronograma de parcerias    (204)
└── /resumo                Resultados & resumo        (239)

Administração
├── /importar              Importar dados             (331)
└── /usuarios              Equipe & acessos           (317)

── FORA DO MENU ──────────────────────────────────────────
/funil                     Funil comercial            (379)  ← órfã
/clientes                  Clientes                    (97)  ← só via seletor
/partes/:id                Ficha da parte             (653)
/projetos/:id              Ficha do projeto           (697)
/marcas/:candidaturaId     Cross Score Card           (357)
/parcerias/:id             Parceria · execução        (341)
```

**13 itens de menu · 7 grupos · 21 páginas · 20 rotas + login**

---

## 2. Problemas encontrados

### 2.1 A navegação descreve o fluxo antigo

Cinco dos sete grupos (`Descobrir`, `Estruturar`, `Avaliar & decidir`,
`Executar & medir`, mais `Operar hoje`) reproduzem as etapas do funil linear.
A inteligência — que é o produto novo — ocupa **2 de 13 itens**.

### 2.2 Sete grupos para treze itens

Média de 1,9 item por grupo. Três grupos têm exatamente 2 itens e um tem 1. O
agrupamento custa mais atenção do que economiza.

### 2.3 Vocabulário sobreposto e ambíguo

Quatro itens diferentes usam alguma variação de "oportunidade":

| Rótulo | Rota | O que realmente é |
|---|---|---|
| Oportunidades de IA | `/oportunidades` | Rascunhos do pipeline |
| Mapa de oportunidades | `/marcas` | Marcas candidatas |
| Mapeamento de oportunidades | `/frentes` | Frentes território·setor |
| Central de operação | `/` | Dashboard |

Isso confunde na navegação e é sintoma do problema de semântica registrado no
SAD §3.1.

### 2.4 Páginas órfãs sem decisão registrada

`/funil` (379 linhas) não tem link. `/clientes` (97 linhas) só é alcançada por um
desvio condicional do seletor. Ambas continuam sendo mantidas e compiladas.

### 2.5 Ausências relevantes

Não há entrada para **documentos** (5 rotas), **evidências e fontes** (9 rotas)
nem **reuniões** — todos componentes do novo núcleo.

### 2.6 Botão "Demo" ao lado de "Sair"

`AppShell.tsx:423` expõe `restaurarDemo()` numa plataforma com dados reais da
conta Grupo Aramis. Risco de acionamento acidental.

---

## 3. Sitemap proposto

Cinco grupos, doze itens visíveis. O eixo passa a ser **inteligência**, e a
ordem reflete o ciclo: descobrir → conhecer → decidir → administrar.

```
INTELIGÊNCIA
├── /                      Dashboard                  ← reescrito (§5)
└── /oportunidades         Oportunidades              ← curadoria + Human Gate

RELACIONAMENTOS
├── /partes                Empresas & marcas
├── /clientes              Clientes Cross             ← REINTEGRADO
└── /artistas              Artistas & Big Moments

CONHECIMENTO
├── /conhecimento          Base de conhecimento (RAG)
├── /reunioes              Reuniões                   ← FUTURO (não nesta sprint)
└── /documentos            Documentos                 ← FUTURO (não nesta sprint)

METODOLOGIA
├── /marcas                Avaliações & Score Card
└── /ranking               Ranking & decisões

SISTEMA
├── /importar              Importar dados
├── /usuarios              Equipe & acessos
└── /configuracoes         Configurações              ← agrupa /criterios
```

### Racional de cada grupo

**INTELIGÊNCIA** — primeiro porque é o produto. Dashboard e curadoria de
oportunidades são as duas telas de trabalho diário na nova visão.

**RELACIONAMENTOS** — a Intelligence Base vista pelo usuário. `/clientes`
volta ao menu: hoje depende de um desvio condicional do seletor, o que é frágil
e invisível.

**CONHECIMENTO** — reúne o que alimenta o RAG. Duas entradas ficam **marcadas
como futuras**: `/reunioes` depende de mudança de modelo (reunião ligada a parte,
não a parceria) e `/documentos` precisa de interface. Não construir nesta sprint.

**METODOLOGIA** — Score Card e ranking permanecem acessíveis. Crossability
**não vira item de menu**: passa a ser motor, exibido dentro da análise da
oportunidade, conforme o briefing pede.

**SISTEMA** — administração e configuração. `/criterios` (critérios e pesos do
Score Card) é configuração, não operação diária — sai da navegação principal.

---

## 4. Destino de cada página

### Saem da navegação (rota preservada)

| Página | Linhas | Classe | Motivo |
|---|---:|---|---|
| `/cronograma` | 204 | HIDE | Gestão operacional de parcerias sai do centro |
| `/resumo` | 239 | HIDE | Substituída pelo Dashboard novo |
| `/frentes` | 291 | HIDE | Vira agrupamento dentro de oportunidades |
| `/projetos` | 238 | HIDE* | *Condicionado à decisão de semântica — ver §6 |
| `/criterios` | 235 | SIMPLIFY | Move para Configurações |
| `/funil` | 379 | DEPRECATE | Já órfã; confirmar desuso antes de remover |
| `/parcerias/:id` | 341 | HIDE | Acessível pelo perfil da parte |

**Todas continuam funcionando por URL direta.** Nenhuma rota é removida do
`App.tsx` nesta sprint.

### Consolidações

| De | Para | Observação |
|---|---|---|
| `/criterios` | `/configuracoes` (aba) | Configuração de modelo por cliente |
| `/resumo` + `/ranking` | `/` (Dashboard) | Ranking absorvido como bloco |
| `/frentes` | `/oportunidades` (filtro) | Frente vira recorte, não página |
| `/parcerias/:id` | `/partes/:id` (aba histórico) | Parceria como histórico da parte |

### Reintegrada

`/clientes` volta ao menu, deixando de depender do desvio do seletor.

---

## 5. Dashboard futuro — arquitetura proposta

> **Apenas arquitetura.** Não conectar IA externa nesta sprint.

O dashboard atual (`Dashboard.tsx`, 307 linhas) é um resumo de cadastros. O
novo responde às oito perguntas do briefing. Proposta de composição em quatro
faixas:

```
┌─────────────────────────────────────────────────────────────────┐
│ FAIXA 1 · AGUARDANDO VOCÊ                          [prioridade] │
│ ┌──────────────────────┐ ┌────────────────────────────────────┐ │
│ │ Human Gate pendente  │ │ Análises em andamento              │ │
│ │ N oportunidades      │ │ pipelines executando + progresso   │ │
│ │ → /oportunidades     │ │ ← tarefa_pipeline (etapa, %)       │ │
│ └──────────────────────┘ └────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ FAIXA 2 · OPORTUNIDADES                                         │
│ Maior potencial (score_fit × confiança) · por cliente ·         │
│ com fontes visíveis          ← oportunidade_ia + Score Card     │
├─────────────────────────────────────────────────────────────────┤
│ FAIXA 3 · O QUE MUDOU                                           │
│ Fatos novos encontrados · artistas em Big Moment ·              │
│ reuniões que agregaram conhecimento                             │
│                    ← information-extractor + evidências         │
├─────────────────────────────────────────────────────────────────┤
│ FAIXA 4 · SAÚDE DA INTELIGÊNCIA                                 │
│ Execuções (24h) · taxa de sucesso · custo estimado ·            │
│ cobertura da base    ← execucao_agente (já tem tokens/duração)  │
└─────────────────────────────────────────────────────────────────┘
```

### Origem de cada pergunta do briefing

| Pergunta | Fonte de dados | Disponível hoje? |
|---|---|---|
| Quais oportunidades existem? | `oportunidade_ia` | **Sim** |
| Quais análises estão acontecendo? | `tarefa_pipeline` (status, progresso) | **Sim** |
| Quais empresas têm maior potencial? | `oportunidade_ia.score_fit` + Score Card | **Sim** |
| Quais aguardam validação? | `oportunidade_ia.status` | **Sim** |
| Quais fatos novos foram encontrados? | `execucao_agente.saida` + evidências | Parcial |
| Quais artistas em Big Moment? | `cross_intelligence` + `Artistas.tsx` | Parcial |
| Quais reuniões agregaram conhecimento? | `cross_execution.reuniao` | **Não** — modelo inadequado |
| Quais recomendações precisam de Human Gate? | `oportunidade_ia.status` | **Sim** |

**Cinco das oito perguntas já têm dados.** Duas são parciais. Uma (reuniões)
depende da mudança de modelo descrita em `03` §2.

**Princípio de composição:** cada bloco declara sua origem de dado e degrada com
elegância quando vazio — nunca inventa número. Enquanto uma fonte não existir, o
bloco fica visivelmente ausente, não preenchido com estimativa.

---

## 6. Ponto que exige decisão humana antes da execução

**A página `/projetos` está condicionada.**

O SAD §3.1 registra que a semântica de "projeto" está em aberto: contêiner por
marca ou iniciativa com prazo. A nova visão remove o projeto do caminho
obrigatório, mas os dados atuais (`ARAMIS`, `URBAN`, `ARAMIS NEXT`) organizam a
operação real da conta Grupo Aramis.

**Esconder `/projetos` sem resolver isso pode retirar da equipe a única forma de
navegar o trabalho corrente.**

Recomendação: manter `/projetos` no menu durante a Sprint 0 e decidir seu destino
junto com a equipe da Cross, antes da Fase C. Está marcada como `HIDE*` na §4
justamente por isso.

---

## 7. Comparativo

| Aspecto | Hoje | Proposto |
|---|---:|---:|
| Grupos | 7 | 5 |
| Itens visíveis | 13 | 12 (10 ativos + 2 futuros) |
| Itens de inteligência | 2 (15%) | 4 (33%) |
| Itens de fluxo operacional | 6 (46%) | 0 |
| Páginas órfãs sem decisão | 2 | 0 |
| Rotas removidas | — | **0** |

**Continua em:** `05-backend-simplification-plan.md`.
