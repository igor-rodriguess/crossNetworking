# 05 — Plano de Simplificação do Backend

**Plataforma Cross** · Sprint 0
Data: 07/08/2026

> **Nada é excluído neste documento nem nesta sprint.** O plano mapeia o que
> continua necessário, o que é redundante e o que pertence apenas ao produto
> antigo — para que a decisão de remoção, quando vier, seja informada.

---

## 1. Panorama: 229 rotas, 59 consumidas

O frontend consome **59 endpoints distintos**. As demais **170 rotas** existem
sem consumidor de interface.

Isso não significa que 170 rotas sejam descartáveis. A distribuição importa:

| Situação | Rotas | Leitura |
|---|---:|---|
| Consumidas pelo frontend | 59 | Núcleo em uso |
| Módulo inteiro sem consumidor | 58 | `execucao`, `resultados`, `governanca`, `documentos` |
| Rotas de etapa do pipeline de IA | 9 | Uso legítimo por teste/depuração |
| Complementares de módulos ativos | ~103 | CRUD completo de recursos parcialmente usados |

---

## 2. Rotas que continuam necessárias (KEEP)

### 2.1 Segurança e plataforma — intocáveis

| Módulo | Rotas | Observação |
|---|---:|---|
| `auth` | 5 | Login, refresh, logout |
| `admin` | 7 | Usuários e escopo por cliente |
| `docs` | 1 | Swagger |

Regra da refatoração: **não desativar segurança, não remover auditoria**.

### 2.2 Intelligence Base — o novo núcleo

| Módulo | Rotas | Papel na Cross Intelligence |
|---|---:|---|
| `inteligencia` | 38 | Perfil estratégico, ativos, públicos, territórios, praças |
| `partes` | 13 | Identidade única — tudo se pendura aqui |
| `clientes` | 13 | Conta contratante e recorte da plataforma |
| `documentos` | 5 | Insumo de RAG (sem interface hoje) |
| `governanca` | 9 | Evidências e fontes — rastreabilidade da IA |

**`governanca` e `documentos` não têm interface, mas são KEEP.** A ausência de
tela reflete uma lacuna do produto atual, não obsolescência: evidências e fontes
sustentam a confiabilidade das recomendações de IA, e documentos alimentam o RAG.

### 2.3 Motor de inteligência

| Módulo | Rotas | Observação |
|---|---:|---|
| `agentes` | 26 | Pipeline, RAG, importação assistida, Human Gate |

### 2.4 Metodologia

| Módulo | Rotas | Observação |
|---|---:|---|
| `metodologias` | 26 | Crossability, Paper, Score Card, decisões — protegido por RN022/RN023 |
| `frentes` | 11 | Candidaturas: unidade de trabalho e destino do Human Gate |

---

## 3. Rotas potencialmente redundantes

Redundância aqui significa **sobreposição funcional**, não duplicação de código.

### 3.1 Três caminhos para "oportunidade"

| Caminho | Módulo | Entidade |
|---|---|---|
| `GET /agentes/oportunidades` | `agentes` | `oportunidade_ia` (rascunho de IA) |
| `GET /frentes/:id/candidaturas` | `frentes` | `candidatura` (marca em avaliação) |
| `GET /projetos/:id/frentes` | `projetos` | `frente_oportunidade` (recorte) |

Três modelos para o mesmo conceito de negócio, em três schemas. **Não
consolidar nesta sprint** — a consolidação depende da decisão de semântica de
projeto (SAD §3.1). Registrar como dívida a resolver na Fase D.

### 3.2 Reuniões em dois contextos

`POST /parcerias/:id/reunioes` (módulo `execucao`) é hoje o único lugar onde
uma reunião existe — e exige uma parceria fechada.

A jornada B (Parceiro → Cliente) precisa registrar reunião com quem **ainda não
é parceiro**. Não é redundância: é uma **lacuna**. A rota atual continua válida
para reuniões de parceria; falta a de inteligência.

### 3.3 Paginação e filtros

Padrão consistente via `shared/pagination.ts`. **Sem redundância** — não mexer.

---

## 4. Rotas exclusivas do produto antigo

Somam **44 rotas**, em dois módulos sem consumidor de interface.

### 4.1 `execucao` — 26 rotas

```
POST/GET  /parcerias/:id/planos-execucao      POST      /planos-execucao/:id/vigencia
POST/GET  /planos-execucao/:id/etapas         PATCH/DEL /etapas/:id
POST/GET  /etapas/:id/entregas                GET/PATCH /entregas/:id
POST/GET  /entregas/:id/responsaveis          DELETE    /entregas/:id/responsaveis/:rid
POST/GET  /parcerias/:id/reunioes             GET/PATCH /reunioes/:id          ← ver §3.2
POST      /reunioes/:id/participantes         DELETE    /reunioes/:id/participantes/:pid
POST/GET  /parcerias/:id/touchpoints
POST/GET  /parcerias/:id/pendencias           PATCH     /pendencias/:id
```

**Classificação: DEPRECATE** (exceto as 6 rotas de reunião, SIMPLIFY).

Evidência: zero referências no frontend. Corresponde a "execução detalhada",
"entregas" e "pendências", explicitamente fora do núcleo novo.

**Não remover.** Cobertas por `execucao.test.ts`, dependem de RN026 e guardam
dados em `cross_execution`.

### 4.2 `resultados` — 18 rotas

```
POST/GET  /parcerias/:id/acompanhamentos      POST/GET  /indicadores
POST/GET  /parcerias/:id/indicadores          DELETE    /parcerias/:id/indicadores/:iid
POST/GET  /parcerias/:id/medicoes             POST/GET  /parcerias/:id/resultados
POST/GET  /parcerias/:id/calculos-roi         GET       /calculos-roi/:id
POST/GET  /projetos/:id/encerramento          POST/GET  /parcerias/:id/encerramento
```

**Classificação: DEPRECATE.** Corresponde a "analytics avançado", "ROI" e
"encerramento". Protegido por RN034. Mesma orientação: manter, não evoluir.

### 4.3 `parcerias` — 15 rotas

**Classificação: HIDE**, não DEPRECATE.

Diferença relevante: `parcerias` **é consumida** pelo frontend
(`/parcerias`, `/parcerias/:id`, `/candidaturas/:id/parceria`). Além disso, o
histórico de parcerias fechadas é insumo legítimo de inteligência — saber com
quem a Aramis já fechou informa recomendações futuras.

Ação: preservar leitura; reduzir a gestão contratual detalhada
(negociações, contrapartidas, contratos) a histórico no perfil da parte.

---

## 5. Controllers e services

### 5.1 Controllers

Auditados: sem redundância estrutural. O padrão (traduzir HTTP, sem regra) está
aplicado de forma consistente. **Nenhuma ação recomendada.**

### 5.2 O único service que exige ação

| Arquivo | Linhas | Situação |
|---|---:|---|
| **`agentes.service.ts`** | **2.153** | Maior arquivo do backend |

Concentra: orquestração de dois pipelines, execução assíncrona, importação CSV,
mapeamento de funil histórico, enriquecimento de partes, RAG e Human Gate.

**Classificação: SIMPLIFY.** É o candidato natural a virar o Agent Framework.

Decomposição sugerida (Fase E, **sem alterar comportamento**):

```
agentes/
├── framework/
│   ├── agent-run.ts          orquestração + registro em execucao_agente
│   ├── pipeline.ts           composição de etapas
│   └── observability.ts      tokens, custo, latência
├── pipelines/
│   ├── partner-discovery.ts
│   └── market-intelligence.ts
├── ingestion/
│   ├── csv-mapping.service.ts
│   └── historical-funnel.service.ts
└── human-gate/
    └── curadoria.service.ts
```

**Critério de aceite:** os 203 testes continuam passando sem alteração. Se um
teste precisar mudar, a decomposição mudou comportamento e deve ser revista.

### 5.3 Services consolidáveis

Nenhum outro. Os 14 módulos restantes têm services proporcionais ao domínio.

---

## 6. Módulos simplificáveis — síntese

| Módulo | Rotas | Classe | Ação nesta sprint |
|---|---:|---|---|
| `agentes` | 26 | SIMPLIFY | Decompor service (Fase E) |
| `execucao` | 26 | DEPRECATE | Congelar; reavaliar reuniões |
| `resultados` | 18 | DEPRECATE | Congelar |
| `parcerias` | 15 | HIDE | Reduzir a histórico |
| `projetos` | 16 | SIMPLIFY* | *Aguarda decisão de semântica |
| `frentes` | 11 | SIMPLIFY | Frente vira recorte |
| `metodologias` | 26 | KEEP | Não tocar (RN022/RN023) |
| `inteligencia` | 38 | KEEP | Não tocar |
| `partes` | 13 | KEEP | Não tocar |
| `clientes` | 13 | KEEP | Não tocar |
| `governanca` | 9 | KEEP | Criar interface (futuro) |
| `documentos` | 5 | KEEP | Ligar ao RAG (futuro) |
| `admin` / `auth` / `docs` | 13 | KEEP | Não tocar |

---

## 7. O que NÃO fazer

Registrado para evitar interpretação equivocada deste plano:

- ❌ Remover as 44 rotas de `execucao` e `resultados` — têm testes, regras de
  banco e dados
- ❌ Consolidar as três representações de oportunidade antes da decisão de
  semântica de projeto
- ❌ Reescrever `agentes.service.ts` — **decompor** preservando comportamento
- ❌ Alterar `metodologias` — RN022 e RN023 são verificadas por trigger
- ❌ Tocar em `auth`, `authz`, `escopo` ou auditoria
- ❌ Remover migrations ou tabelas

---

## 8. Métrica de sucesso

O backend não precisa ficar menor nesta sprint. Precisa ficar **compreendido**:

| Pergunta | Resposta após esta auditoria |
|---|---|
| Quais rotas sustentam a Cross Intelligence? | 115 (`inteligencia`, `partes`, `clientes`, `agentes`, `metodologias`, `frentes`, `governanca`, `documentos`) |
| Quais pertencem só ao produto antigo? | 44 (`execucao`, `resultados`) |
| Quais estão em zona de decisão? | 42 (`projetos`, `frentes`, `parcerias`) |
| Qual arquivo concentra risco? | `agentes.service.ts` (2.153 linhas) |

**Continua em:** `06-ai-readiness-assessment.md`.
