# 07 — Plano de Execução da Sprint 0

**Plataforma Cross** · Sprint 0
Data: 07/08/2026

> **Este plano não foi executado.** Nenhuma alteração de código foi feita.
> A execução aguarda aprovação humana explícita, item a item.

## Invariantes (valem para todas as fases)

- Não excluir migrations, tabelas, schemas, dados, triggers ou constraints
- Não alterar `auth`, `authz`, `escopo`, auditoria ou Human Gate
- Não alterar `metodologias` (RN022/RN023 são verificadas por trigger)
- Não integrar API paga, não inserir chaves
- Não alterar infraestrutura de produção
- Nenhuma rota é removida do `App.tsx` — páginas saem do **menu**, não do sistema
- Ao fim de cada fase: 203 testes de backend + 27 de frontend **verdes**

---

## FASE A — Auditoria ✅ concluída

**Objetivo:** compreender o sistema antes de qualquer alteração.

**Entregue:** os sete documentos em `docs/sprint-0/`.

**Achados que mudam o plano:**

1. O pipeline de IA do briefing **já está implementado** (13 agentes, 9 rotas de
   etapa, Human Gate). A sprint organiza, não constrói.
2. **58 rotas** em 4 módulos sem consumidor de interface.
3. **Mock em caminho de produção** — contadores errados na tela.
4. Duas páginas já órfãs (`/funil`, `/clientes`).
5. `agentes.service.ts` com 2.153 linhas concentra o Agent Framework.
6. Reuniões presas a `parceria_id` — jornada B inviável hoje.

**Critério de aceite:** documentos revisados e aprovados pelo responsável.
**Risco:** nenhum (somente leitura).

---

## FASE B — Poda visual e correção de dados

**Objetivo:** eliminar dado incorreto na interface e reduzir risco operacional.
Esta fase corrige defeitos; não muda produto.

### B.1 Remover mock do caminho de produção — **prioridade máxima**

| Item | Detalhe |
|---|---|
| **Objetivo** | Contadores exibidos ao usuário devem vir da API, não de array estático |
| **Arquivos** | `frontend/src/pages/Partes.tsx` (linhas 6, 132) · `frontend/src/pages/ParteDetalhe.tsx` (linha 9) |
| **Como** | Substituir `import { PARCERIAS } from '../data/mock'` por consumo de `GET /parcerias` (endpoint já usado pelo front) |
| **Risco** | **Médio** — muda números na tela. É o objetivo: os atuais estão errados |
| **Dependências** | Nenhuma |
| **Aceite** | Zero `import ... from '../data/mock'` em `pages/`; contagem confere com o banco; 27 testes verdes |

> Por que primeiro: enquanto isso existir, qualquer decisão de produto baseada
> no que a tela mostra parte de número inventado. Também contradiz o `SAD.md` §5,
> que afirma não haver mock em produção.

### B.2 Esconder o botão "Demo" em produção

| Item | Detalhe |
|---|---|
| **Objetivo** | Evitar acionamento acidental de `restaurarDemo()` sobre dados reais |
| **Arquivos** | `frontend/src/components/AppShell.tsx` (linhas 423–428) |
| **Como** | Condicionar a `import.meta.env.DEV` |
| **Risco** | **Baixo** |
| **Aceite** | Botão ausente no build de produção, presente em desenvolvimento |

### B.3 Corrigir o rodapé "dados reais"

| Item | Detalhe |
|---|---|
| **Arquivos** | `AppShell.tsx` (linha 492) |
| **Risco** | Baixo · **Dependência:** B.1 |
| **Aceite** | Rodapé condizente com o estado real |

### B.4 Registrar decisão sobre `/funil`

| Item | Detalhe |
|---|---|
| **Objetivo** | Confirmar com a equipe da Cross se alguém acessa `/funil` por URL |
| **Ação** | **Perguntar, não remover.** 379 linhas sem link no menu |
| **Risco** | Baixo · **Aceite:** decisão registrada neste documento |

---

## FASE C — Simplificação da navegação

**Objetivo:** a navegação passa a refletir a Cross Intelligence.
**Dependência:** Fase B concluída · decisão sobre `/projetos` (ver C.0).

### C.0 — Bloqueio a resolver antes

**A semântica de "projeto" precisa ser decidida com a equipe da Cross.**

O SAD §3.1 registra duas leituras possíveis. Os dados reais (`ARAMIS`, `URBAN`,
`ARAMIS NEXT`) são contêineres por marca. Esconder `/projetos` sem essa decisão
pode retirar da equipe a única forma de navegar o trabalho corrente.

**Não executar C.2 sem esta resposta.**

### C.1 Reestruturar o menu para 5 grupos

| Item | Detalhe |
|---|---|
| **Objetivo** | De 7 grupos/13 itens para 5 grupos/10 itens ativos |
| **Arquivos** | `AppShell.tsx` (`NAVEGACAO`, linhas 44–96; `TITULOS`, 293–310) |
| **Como** | Conforme `04-navigation-redesign.md` §3. Rotas do `App.tsx` **intocadas** |
| **Risco** | **Médio** — muda o caminho diário da equipe |
| **Aceite** | Toda página continua acessível por URL; nenhuma rota removida; 27 testes verdes |

### C.2 Retirar do menu (rotas preservadas)

`/cronograma`, `/resumo`, `/frentes`, `/parcerias/:id` — e `/projetos`
**somente se** C.0 assim decidir.

| **Risco** | Médio · **Aceite** | URLs continuam funcionando |

### C.3 Reintegrar `/clientes`; mover `/criterios` para Configurações

| **Risco** | Baixo · **Dependência** | C.1 |

---

## FASE D — Reorganização do domínio (documental)

**Objetivo:** registrar decisões de modelo **sem alterar o banco**.

> Nenhuma migration é escrita nesta fase. Regra crítica da sprint: a primeira
> poda ocorre na experiência, não na persistência.

### D.1 Especificar reunião como evento de inteligência

| Item | Detalhe |
|---|---|
| **Objetivo** | Desenhar (em documento) reunião ligada a **Parte**, não a `parceria_id` |
| **Entrega** | Especificação de migration aditiva, sem executá-la |
| **Risco** | Baixo (documental) · **Dependência:** C.0 |
| **Aceite** | Documento aprovado; nenhuma migration criada |

### D.2 Consolidar vocabulário de oportunidade

Registrar a relação entre `oportunidade_ia`, `candidatura` e
`frente_oportunidade`, e como convergem no alvo. Documental.

### D.3 Congelar `execucao` e `resultados`

| Item | Detalhe |
|---|---|
| **Objetivo** | Marcar as 44 rotas como congeladas: sem novas funcionalidades |
| **Como** | Comentário de cabeçalho nos `*.routes.ts` + registro aqui |
| **Risco** | **Baixo** — nenhuma alteração funcional |
| **Aceite** | Rotas respondem como antes; 203 testes verdes |

---

## FASE E — Preparação do Agent Framework

**Objetivo:** decompor `agentes.service.ts` **preservando comportamento**.
**Dependência:** Fases B–D concluídas.

### E.1 Decompor o service (2.153 linhas)

| Item | Detalhe |
|---|---|
| **Objetivo** | Extrair framework/pipelines/ingestão/human-gate conforme `05` §5.2 |
| **Arquivos** | `backend/src/modules/agentes/agentes.service.ts` → nova estrutura de pastas |
| **Como** | Movimentação de código sem alteração de lógica; assinaturas públicas preservadas |
| **Risco** | **Alto** — é o coração da IA |
| **Aceite** | **Os 203 testes passam sem nenhuma alteração nos testes.** Se um teste precisar mudar, o comportamento mudou: reverter |

> Critério deliberadamente rígido: em refatoração estrutural, teste alterado
> deixa de ser evidência de preservação.

### E.2 Formalizar contrato `AgentStep`

Interface TypeScript explícita (entrada, saída, evidências, uso), aplicada
primeiro a **um** agente como prova. Risco médio.

### E.3 Especificar observabilidade de custo

| Item | Detalhe |
|---|---|
| **Objetivo** | Especificar colunas aditivas (`modelo`, `custo_estimado`, `tokens_cache`) e tabela de uso de ferramenta |
| **Entrega** | Especificação — **migration não é executada nesta sprint** |
| **Risco** | Baixo (documental) |
| **Aceite** | Documento cobre os 13 campos de `06` §5 |

---

## FASE F — Validação

**Objetivo:** provar que a poda não quebrou nada.

| Verificação | Comando | Critério |
|---|---|---|
| Tipos (backend) | `npm run typecheck` | Sem erro |
| Testes de backend | `npm test` | **203 verdes** |
| Tipos (frontend) | `npm run typecheck` | Sem erro |
| Testes de frontend | `npm test` | **27 verdes** |
| Build de produção | `npm run build` | Sucesso |
| Dependências | `npm run audit:prod` | Sem vulnerabilidade alta |
| Rotas preservadas | Conferir `App.tsx` | Mesmas 20 rotas + login |
| Sem mock em produção | Busca por `data/mock` em `pages/` | Zero ocorrências |
| Regras de banco | Conferir migrations | 54 migrations intactas |

**Verificação manual complementar:** acessar por URL direta cada página retirada
do menu e confirmar que carrega.

> Pré-requisito de teste: `docker compose up -d db-test` e
> `npm run db:migrate:test`. A suíte se recusa a rodar sem `TEST_DATABASE_URL`.

---

## Ordem recomendada e esforço

| Ordem | Fase | Depende de | Risco | Esforço |
|---:|---|---|---|---|
| 1 | **B.1** mock em produção | — | Médio | Baixo |
| 2 | **B.2, B.3** demo e rodapé | B.1 | Baixo | Baixo |
| 3 | **B.4** decisão `/funil` | — | Baixo | Conversa |
| 4 | **C.0** decisão de "projeto" | — | — | **Conversa — bloqueante** |
| 5 | **C.1** menu de 5 grupos | B, C.0 | Médio | Médio |
| 6 | **C.2, C.3** retirar e reintegrar | C.1 | Médio | Baixo |
| 7 | **D.1–D.3** documentar e congelar | C | Baixo | Médio |
| 8 | **E.1** decompor service | B–D | **Alto** | **Alto** |
| 9 | **E.2, E.3** contrato e custo | E.1 | Médio | Médio |
| 10 | **F** validação | Todas | — | Baixo |

**Dois pontos de conversa (3 e 4) vêm antes do trabalho de maior risco.** São
decisões de negócio que nenhuma análise de código resolve.

---

## Fora do escopo desta sprint

| Item | Por quê |
|---|---|
| Habilitar RLS | Necessário antes de acesso externo; não é objetivo da Sprint 0 |
| Migration de reuniões | Sprint 0 não altera o banco — apenas especifica (D.1) |
| Dashboard novo | Arquitetura proposta em `04` §5; construção é posterior |
| Integrar OpenAI/Firecrawl | Explicitamente vedado |
| Interface de evidências | Depende do Agent Framework |
| Remover `execucao`/`resultados` | `DEPRECATE` ≠ remoção; requer evidência adicional |
| Remover `/funil` | Aguarda B.4 |

---

## Definição de conclusão

A Sprint 0 estará concluída quando:

1. Os sete documentos estiverem aprovados
2. A interface não exibir dado de mock
3. A navegação refletir a Cross Intelligence
4. As decisões de `/funil` e de "projeto" estiverem registradas
5. `agentes.service.ts` estiver decomposto **com os 203 testes intactos**
6. Nenhuma migration, tabela ou dado tiver sido removido
7. Backend e frontend continuarem verdes

E quando as duas perguntas de sucesso tiverem resposta registrada:

**"O que precisa permanecer?"** → O núcleo de inteligência (`03` §10): partes,
perfis, conhecimento, pipeline de agentes, oportunidades, Crossability, Score
Card, Human Gate, segurança. Já existe — precisa ser revelado, não construído.

**"Qual o menor núcleo para agentes de alta qualidade?"** → O que já está em
`cross_ai` mais quatro lacunas: reuniões como fonte, Agent Framework, custo
observável e evidências visíveis na curadoria.
