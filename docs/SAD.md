# SAD — Documento de Arquitetura de Software

**Plataforma Cross** · Cross Networking
Última revisão: 31/07/2026

---

## 1. Objetivo e escopo

A Plataforma Cross apoia a operação da Cross Networking na gestão de parcerias
entre marcas: mapeia oportunidades, avalia o encaixe entre cliente e possível
parceiro, conduz a conversa comercial e acompanha a execução do que foi fechado.

Este documento descreve a arquitetura como ela **é hoje**, não como se pretende
que venha a ser. Onde há dívida conhecida, ela está registrada como tal na
seção 11 — a intenção é que este texto seja utilizável por quem for operar,
auditar ou continuar o desenvolvimento.

Os indicadores citados foram verificados diretamente no código e no banco em
operação em 31/07/2026.

---

## 2. Visão geral

```
┌──────────────┐        HTTPS/JSON        ┌──────────────┐      TCP/TLS     ┌───────────────┐
│   Frontend   │ ───────────────────────▶ │   Backend    │ ───────────────▶ │   Postgres    │
│ React + Vite │ ◀─────────────────────── │ Node/Express │ ◀─────────────── │  (Supabase)   │
└──────────────┘                          └──────────────┘                  └───────────────┘
                                                 │
                                                 ├──▶ LLM (Ollama local / DeepSeek / OpenAI)
                                                 └──▶ Firecrawl (coleta web)
```

Três camadas independentes. O frontend é estático (pode ir para qualquer CDN);
o backend é um processo Node de longa duração; o banco é gerenciado pelo
Supabase. Os serviços de IA são opcionais — sem chave, os agentes operam em
modo determinístico (*mock*), o que permite desenvolver sem custo.

### 2.1 Tecnologias

| Camada | Stack | Observação |
|---|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind 3, Zustand | 13.444 linhas · 66 arquivos |
| Backend | Node 22, Express 4, TypeScript, Zod, pino | 17.438 linhas · 234 rotas · 15 módulos |
| Banco | PostgreSQL 16 (Supabase), pgvector | 54 migrations · 118 tabelas em 10 schemas |
| Testes | Vitest (backend e frontend), Testing Library | 203 + 27 casos |
| IA | Ollama (local), DeepSeek, OpenAI (embeddings), Firecrawl | 13 agentes; todos opcionais |

O frontend usa **HashRouter**: as URLs têm o formato `/#/rota`. Isso permite
servir a aplicação de qualquer host estático sem configuração de rewrite.

---

## 3. Modelo de domínio

O banco é organizado em **schemas por domínio**, o que mantém as fronteiras
explícitas e facilita conceder permissão por área:

| Schema | Responsabilidade |
|---|---|
| `cross_core` | Partes (organizações e pessoas), usuários, papéis, documentos |
| `cross_commercial` | Clientes da Cross, contratos, remuneração |
| `cross_intelligence` | Perfil estratégico, ativos, públicos, territórios, praças |
| `cross_projects` | Projetos, frentes de oportunidade, candidaturas, funil |
| `cross_methodologies` | Crossability, Paper, Score Card, decisões |
| `cross_partnerships` | Parcerias fechadas, contratos, contrapartidas |
| `cross_execution` | Plano de execução, entregas, reuniões, pendências |
| `cross_analytics` | Indicadores, medições, ROI, encerramento |
| `cross_governance` | Auditoria, evidências, fontes |
| `cross_ai` | Execuções de agentes, oportunidades geradas, RAG |

### 3.1 Vocabulário do domínio

Esta seção existe porque três termos se confundem no uso diário. A distinção
abaixo é a que o modelo implementa:

**Parte** — qualquer organização ou pessoa na base: um cliente, uma marca
parceira, um artista. É a identidade única; tudo o mais se pendura nela. A mesma
Parte pode ser cliente numa conta e parceira em outra.

**Cliente** (`cliente_cross`) — a Parte que contrata a Cross. É o que o seletor
no topo da interface escolhe, e o recorte de quase toda tela.

**Projeto** — uma **iniciativa estratégica** de um cliente, com objetivo e
prazo. Existe independentemente de haver parceria fechada: "Plataforma Verão
2026" é um projeto desde o dia em que a Cross começa a trabalhá-lo.

**Frente de oportunidade** — o recorte de busca dentro de um projeto, no formato
`TERRITÓRIO · SETOR` (ex.: `COLLABS · MODA · ACESSÓRIOS`). Agrupa as marcas
candidatas de uma mesma categoria. Na interface, chamamos esse agrupamento de
**setor**, e não de "frente": no vocabulário da equipe, *frente* designa a
conversa aberta com uma marca ("abrir frente", "frente aberta"), que aqui é um
**status de candidatura**. O nome da tabela permanece `frente_oportunidade` por
razões históricas.

**Candidatura** — uma marca sendo avaliada para uma frente, com status próprio
e histórico de movimentações. É a unidade de trabalho do dia a dia.

**Parceria** — o que foi efetivamente fechado, com contrato, contrapartidas e
plano de execução. Uma candidatura aprovada é *promovida* a parceria; são
entidades distintas, em schemas distintos.

> **Ponto aberto.** A leitura acima ("projeto = iniciativa") foi validada com o
> desenvolvimento, mas ainda não com toda a equipe da Cross. Há uma leitura
> alternativa em discussão — projeto como sinônimo de parceria fechada — que,
> se adotada, faria as frentes se pendurarem diretamente na marca. Os registros
> atuais (`ARAMIS`, `URBAN`, `ARAMIS NEXT`) são contêineres por marca, não
> iniciativas com prazo, e refletem essa indefinição.

### 3.2 Regras de negócio estruturais

Regras críticas são garantidas pelo **banco**, não apenas pela aplicação:

| Regra | Onde vive |
|---|---|
| RN022 — Score Card exige Paper validado | `trg_avaliacao_validar_validacao_aprovada` |
| RN023 — score = Σ pontuações + potencial | `fn_validar_score_total` (constraint trigger) |
| RN026 — parceria exige decisão aprovada e Paper validado | `trg_parceria_validar_aprovacao` |
| RN034 — um encerramento por projeto/parceria | `uq_encerramento_*` |
| RN037 — auditoria imutável | `REVOKE UPDATE, DELETE` sobre `cross_governance.auditoria` |

O Cross Score Card (RN023) é calculado em três camadas independentes —
frontend, backend e trigger — justamente porque é o número que sustenta a
recomendação levada ao cliente. Nunca é digitado à mão.

---

## 4. Backend

### 4.1 Organização

Camadas explícitas, uma pasta por módulo de domínio:

```
routes → controller → service → repository → banco
```

- **routes** — declara caminho, middleware de autorização e schema de entrada
- **controller** — traduz HTTP (parâmetros, status, ETag); não tem regra
- **service** — regra de negócio e transação
- **repository** — SQL parametrizado; nenhuma concatenação de string

Transações passam por `withTransaction()`, que também define `app.usuario_id`
para os gatilhos de auditoria.

### 4.2 Autenticação e autorização

**Autenticação** — JWT de acesso (curto) e refresh token (longo). Senhas com
**scrypt**, comparadas em tempo constante contra um hash-dummy quando o usuário
não existe, para que o tempo de resposta não revele e-mails cadastrados.

**Autorização por persona** (`shared/middleware/authz.ts`) — responde *o que* a
pessoa pode fazer. Personas: `administrador` (superconjunto), `estrategista`,
`gestor_contas`, `coordenador`.

**Escopo por cliente** (`shared/escopo.ts`, migration 052) — responde *quais
contas* a pessoa pode ver. O escopo restrito é **opt-in**: um usuário sem
vínculos declarados em `usuario_cliente_escopo` continua enxergando todas as
contas, que é o comportamento adequado para a equipe interna de uma agência.
Ao declarar vínculos para um usuário, ele passa a ver apenas aquelas contas.

A decisão vive na função `cross_core.usuario_pode_ver_cliente(usuario, cliente)`,
de modo que serviço e (futuramente) políticas de RLS compartilhem a mesma regra.
Acesso a conta fora do escopo responde **404**, não 403 — informar que o recurso
existe permitiria enumerar clientes.

### 4.3 Segurança de borda

| Proteção | Implementação |
|---|---|
| Headers de segurança | `helmet` |
| CORS | origem configurável; `*` é recusado em produção |
| Rate limit | 300 req/min por IP (configurável) |
| Tamanho de corpo | 1 MB (configurável) |
| SQL injection | queries parametrizadas em toda a camada de repositório |
| Segredos | `JWT_SECRET` e `METRICS_TOKEN` obrigatórios e distintos em produção |

Verificação prática executada em 31/07/2026: requisições sem token, com token
forjado (`alg=none`), com assinatura adulterada e com payloads de SQL injection
foram todas rejeitadas; `senha_hash` não aparece em nenhuma resposta.

---

## 5. Frontend

Aplicação React servida estaticamente. Estado global em **Zustand**; o estado de
domínio vem inteiramente da API (não há mock em produção).

Organização:

```
src/
├── api/         cliente HTTP, contratos e mapeadores back↔front
├── components/  primitivos de UI e o AppShell (navegação)
├── lib/         regras puras (score, funil, formatação) e hooks de dados
├── pages/       uma por rota, carregadas sob demanda (code splitting)
└── store/       Zustand com persistência
```

Os **mapeadores** (`api/mappers`) isolam o formato do backend do modelo da
interface — mudanças de contrato ficam contidas nessa camada.

O seletor de cliente no topo define o recorte de toda a aplicação: trocar de
conta troca funil, mapeamento e candidaturas.

---

## 6. Agentes de IA

Pipeline multiagente para descoberta de oportunidades:

```
Planning → Collect → Credibilidade → Verificação → Resolução de entidades
        → Extração → Reasoning (Crossability) → Recomendação → Human Gate
```

O **Crossability Reasoning** aplica as seis dimensões da metodologia
(públicos, territórios, ativos, sinergias, fit estratégico, momento) e produz um
**rascunho**. Nada entra na base sem o **Human Gate**: o agente propõe, o
especialista promove.

Sem chaves de API, todos os agentes operam em modo determinístico. O provedor de
LLM é plugável (`AI_PROVIDER`): Ollama local, DeepSeek ou OpenAI.

---

## 7. Dados e persistência

**Migrations versionadas** com checksum SHA-256, aplicadas uma única vez e
verificadas a cada execução (WAD 7.4.22). O checksum normaliza fim de linha —
sem isso, o git convertendo LF/CRLF entre plataformas marcaria migrations
intocadas como alteradas.

**Papéis de banco separados**: a aplicação usa `cross_app` (sem DDL, sem
superusuário); as migrations usam o papel administrativo. Reduz o alcance de uma
eventual comprometição da aplicação.

**Backup**: `npm run db:backup` exporta todos os schemas `cross_*` comprimidos,
com timestamp. Em produção, combinar com os backups gerenciados do Supabase
(PITR no plano pago) e testar a restauração periodicamente.

---

## 8. Testes

| Suíte | Casos | Duração | Alvo |
|---|---|---|---|
| Backend | 203 | ~18 min | banco de teste isolado |
| Frontend | 27 | ~4 s | jsdom |

A suíte do backend é de **integração real**: sobe a aplicação e executa contra
um Postgres. Cada caso roda dentro de uma transação com `ROLLBACK`.

**O banco de teste é obrigatório e separado.** Sem `TEST_DATABASE_URL` definida,
a suíte se recusa a rodar em vez de cair na base de produção — proteção
adicionada depois de resíduos de testes E2E terem chegado ao banco real em
julho/2026 (limpos pela migration 051).

```bash
docker compose up -d db-test     # Postgres de teste, porta 5433, efêmero
npm run db:migrate:test          # aplica o schema
npm test
```

A lentidão do backend vem da latência de rede quando se aponta para um banco
remoto; contra o Postgres local em Docker, cai substancialmente.

---

## 9. Decisões arquiteturais

Registradas para que quem der continuidade entenda o raciocínio — e possa
revisá-lo com base no contexto, não por suposição.

### 9.1 Express em vez de framework opinativo

**Contexto.** A API poderia usar NestJS, AdonisJS ou similar, que já trazem
injeção de dependência, estrutura de módulos e convenções prontas.

**Decisão.** Express com camadas explícitas (rota → controlador → serviço →
repositório), impostas por convenção e revisão.

**Motivo.** O domínio é rico e as regras são específicas; o ganho de um framework
opinativo estaria sobretudo em padronização, que a estrutura por módulos já
oferece. Em contrapartida, Express mantém a superfície de dependências pequena —
11 pacotes de produção, com zero vulnerabilidades conhecidas — e não impõe curva
de aprendizado adicional a quem entrar no projeto.

**Custo aceito.** A disciplina de camadas depende de revisão, não do compilador.

### 9.2 SQL direto em vez de ORM

**Contexto.** Prisma ou TypeORM automatizariam o acesso a dados e gerariam tipos.

**Decisão.** `pg` com SQL parametrizado escrito à mão, isolado na camada de
repositório.

**Motivo.** O modelo tem 118 tabelas com relacionamentos densos e consultas
analíticas (ranking, agregações por frente, RAG com pgvector). ORMs tendem a
gerar SQL ineficiente nesses casos e dificultam o uso de recursos específicos do
PostgreSQL — `count(*) OVER()`, CTEs, extensões. Escrever o SQL torna o custo de
cada consulta visível.

**Custo aceito.** Mais código para escrever e nenhuma geração automática de
tipos; mitigado por concentrar todo o SQL na camada de repositório.

### 9.3 Regras críticas também no banco

**Contexto.** Validar apenas na aplicação seria mais simples e centralizado.

**Decisão.** Regras que comprometem a integridade do negócio são garantidas por
*constraints* e *triggers*, além da aplicação.

**Motivo.** O Cross Score Card sustenta a recomendação levada ao cliente; um
valor inconsistente compromete a credibilidade da metodologia. Da mesma forma, a
trilha de auditoria perde a função se puder ser alterada. Regras assim não podem
depender de um único ponto de verificação — carga de dados, correção manual ou
um bug da aplicação as contornariam.

**Custo aceito.** A regra vive em dois lugares e precisa ser mantida em ambos.

### 9.4 Zustand em vez de Redux

**Contexto.** Redux é o padrão consolidado para estado global em React.

**Decisão.** Zustand com persistência.

**Motivo.** O estado de domínio vem inteiramente da API; o estado global do
frontend guarda pouco — cliente selecionado, dados carregados, preferências de
interface. Redux traria cerimônia (ações, reducers, middlewares) desproporcional
a esse volume.

**Custo aceito.** Menos ferramental de depuração que o Redux DevTools oferece.

### 9.5 HashRouter em vez de BrowserRouter

**Contexto.** URLs no formato `/#/rota` são menos elegantes que `/rota`.

**Decisão.** HashRouter.

**Motivo.** Dispensa configuração de *rewrite* no servidor: a aplicação funciona
em qualquer host estático, inclusive aberta do sistema de arquivos. Reduz uma
classe inteira de erro de implantação — a tela em branco por rota não resolvida.

**Custo aceito.** URLs menos limpas e leve impacto em indexação, irrelevante numa
aplicação interna atrás de autenticação.

### 9.6 Agentes de IA como proposta, nunca como decisão

**Contexto.** O pipeline poderia gravar diretamente as oportunidades descobertas.

**Decisão.** Toda saída de agente é rascunho até aprovação humana explícita
(*Human Gate*).

**Motivo.** A recomendação de parceria é levada a um cliente real. Um dado
incorreto gerado por LLM que entrasse na base sem revisão comprometeria a
credibilidade da Cross diante do cliente — risco desproporcional ao ganho de
automação.

**Custo aceito.** O ganho de produtividade da IA fica limitado pela capacidade de
revisão da equipe.

---

## 10. Requisitos não-funcionais

Metas dimensionadas para o uso previsto — dezenas de usuários internos, com
volume de algumas requisições por minuto.

| Atributo | Meta | Como é atendido hoje |
|---|---|---|
| **Disponibilidade** | Horário comercial estendido | Serviços gerenciados com redundância do provedor; `/readyz` para verificação externa |
| **Desempenho** | Resposta abaixo de 500 ms nas telas de leitura | Índices nas colunas de filtro; paginação obrigatória em toda listagem |
| **Segurança** | Autenticação obrigatória; sem vazamento entre clientes | JWT, scrypt, escopo por cliente na camada de serviço (RLS pendente — ver 11.1) |
| **Auditabilidade** | Toda alteração rastreável ao autor | Trilha imutável, com 1.422 registros |
| **Recuperação** | Perda máxima de um dia de trabalho | Backup diário do Supabase e PITR no plano Pro |
| **Manutenibilidade** | Mudança de regra em ponto único | Camadas explícitas; regra de negócio fora do frontend |
| **Portabilidade** | Sem dependência de provedor específico | PostgreSQL padrão; nenhum recurso proprietário do Supabase em uso |

O último ponto merece registro: embora o Supabase seja o provedor atual, a
aplicação usa apenas PostgreSQL padrão e o pgvector. Não há dependência de Auth,
Realtime ou Edge Functions — migrar para outro provedor de PostgreSQL exigiria
apenas trocar a string de conexão.

---

## 11. Dívidas conhecidas

Registradas explicitamente para que decisões futuras sejam informadas:

1. **RLS não habilitado.** O escopo por cliente é aplicado na camada de serviço.
   Enquanto o banco não tiver políticas de *Row Level Security*, uma consulta que
   esqueça o filtro contorna o isolamento. Recomendado habilitar **antes** de dar
   acesso a usuários externos à Cross.

2. **Cobertura de frontend inicial.** 27 testes cobrem as regras puras (score,
   funil) e os primitivos de UI; as páginas ainda não têm teste de interação.

3. **Semântica de projeto em aberto.** Ver 3.1. Os registros atuais são
   contêineres por marca, não iniciativas com prazo.

4. **Duplicidade de conta.** `Aramis` e `Grupo Aramis` existem como clientes
   distintos; os projetos pertencem ao segundo. Decisão pendente sobre unificar.

5. **Suíte lenta contra banco remoto.** Mitigado pelo banco local; a configuração
   depende de Docker instalado na máquina de desenvolvimento.

---

## 12. Referências

- `docs/ARQUITETURA_INFRAESTRUTURA.md` — hospedagem, ambientes, deploy e operação
- `docs/agents/AGENT_RUNTIME_CONTEXT.md` — contexto de runtime dos agentes
- `backend/docs/ESPECIFICACAO_ROTAS.md` — catálogo de rotas por requisito
- `backend/.env.example` — todas as variáveis, com explicação
