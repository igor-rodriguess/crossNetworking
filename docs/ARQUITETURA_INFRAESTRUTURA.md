# Arquitetura de Infraestrutura e Operação

**Plataforma Cross** · Cross Networking
Documento técnico para avaliação e implantação
Versão 1.0 — 31/07/2026

---

## Sumário executivo

Este documento descreve a arquitetura de infraestrutura proposta para a
Plataforma Cross, cobrindo hospedagem, ambientes, esteira de deploy, gestão de
acessos, segurança, custo e escalabilidade.

A proposta se apoia em quatro provedores: **Vercel** (frontend), **Supabase**
(banco de dados e serviços gerenciados), **Cloudflare** (DNS, TLS, CDN e
proteção de borda) e um **host de aplicação** para a API. Todo o código
permanece no GitHub sob organização da Cross Networking, e a esteira de deploy é
automatizada via GitHub Actions.

O custo inicial estimado é de **US$ 45 a 70 por mês**, com caminho de
escalabilidade que não exige rearquitetura nos próximos estágios de crescimento.

### Observação sobre o escopo da API

A especificação inicial previa Supabase como backend completo, com Edge
Functions quando necessário. Essa configuração não comporta a aplicação atual, e
o motivo é técnico, não de preferência:

A API é uma aplicação **Node/Express com 234 rotas distribuídas em 15 módulos de
domínio**. Edge Functions do Supabase executam Deno com tempo de vida curto, o
que impede dois comportamentos essenciais do sistema:

1. **Pipelines de IA assíncronos.** O agendamento de tarefas responde de
   imediato e prossegue processando em segundo plano por vários minutos,
   gravando progresso no banco. Em execução efêmera, o processamento é
   interrompido junto com a resposta HTTP.
2. **Estado entre requisições.** Pool de conexões PostgreSQL e *rate limit* por
   IP pressupõem um processo contínuo. Em funções isoladas, o pool não se
   reaproveita e o limite de requisições deixa de ser efetivo.

Migrar 234 rotas para funções edge equivaleria a reescrever o backend, com
descarte de código em operação e coberto por testes. A arquitetura proposta
mantém Vercel, Supabase e Cloudflare conforme solicitado, **acrescentando um
host de aplicação para a API** — componente de baixo custo (US$ 7 a 25/mês) e
operação simples.

---

## 1. Arquitetura geral

### 1.1 Topologia

```
                        ┌─────────────────────────┐
                        │       Cloudflare        │
                        │  DNS · TLS · CDN · WAF  │
                        └───────────┬─────────────┘
                                    │
                ┌───────────────────┴───────────────────┐
                │                                       │
     app.crossnetworking.com.br            api.crossnetworking.com.br
                │                                       │
    ┌───────────▼───────────┐              ┌────────────▼────────────┐
    │        Vercel         │   HTTPS/JSON │    Host de aplicação    │
    │  React · Vite · SPA   │─────────────▶│   Node · Express · TS   │
    │   (build estático)    │◀─────────────│    (processo contínuo)  │
    └───────────────────────┘              └────────────┬────────────┘
                                                        │ TCP/TLS
                                           ┌────────────▼────────────┐
                                           │        Supabase         │
                                           │  PostgreSQL 16 + pgvector│
                                           │  Storage · Backups · PITR│
                                           └────────────┬────────────┘
                                                        │
                                           ┌────────────▼────────────┐
                                           │   Serviços de IA (opc.) │
                                           │ DeepSeek/OpenAI/Firecrawl│
                                           └─────────────────────────┘
```

### 1.2 Componentes

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind | Interface; artefato estático servido por CDN |
| **API** | Node, Express, TypeScript, Zod | Regras de negócio, autenticação, orquestração de agentes |
| **Banco** | PostgreSQL 16 (Supabase) | Persistência, integridade referencial, auditoria |
| **Borda** | Cloudflare | DNS, TLS, cache, mitigação de DDoS, WAF |
| **Armazenamento** | Supabase Storage | Documentos e evidências |
| **IA** | Ollama / DeepSeek / OpenAI / Firecrawl | Inferência e coleta; todos opcionais |

### 1.3 Divisão de responsabilidades

O sistema mantém uma separação estrita entre camadas:

**Frontend** não contém regra de negócio. Consome exclusivamente a API,
tratando o backend como fonte única de verdade. O artefato de build é estático,
o que permite distribuição por CDN e *rollback* instantâneo.

**API** concentra a regra de negócio e é o único componente com credencial de
banco. Organizada em camadas explícitas — rota, controlador, serviço,
repositório — com validação de entrada por schema (Zod) em toda superfície
pública.

**Banco** não é passivo. Regras críticas são garantidas por *constraints* e
*triggers*, e não apenas pela aplicação: cálculo do Score Card, pré-requisitos
de formalização de parceria e imutabilidade da trilha de auditoria são
verificados no próprio PostgreSQL.

### 1.4 Domínios

| Domínio | Aponta para | Observação |
|---|---|---|
| `crossnetworking.com.br` | Redirecionamento para `app.` | Institucional |
| `app.crossnetworking.com.br` | Vercel | Frontend |
| `api.crossnetworking.com.br` | Host de aplicação | API |
| `staging.crossnetworking.com.br` | Vercel (preview) | Homologação |
| `api-staging.crossnetworking.com.br` | Host de aplicação | API de homologação |

A separação por subdomínio simplifica a política de CORS, isola certificados e
permite escalar as camadas de forma independente.

---

## 2. Ambientes

### 2.1 Matriz de ambientes

| Ambiente | Frontend | API | Banco | Propósito |
|---|---|---|---|---|
| **Desenvolvimento** | local (Vite) | local | Postgres em Docker | Trabalho diário |
| **Teste** | — | — | Postgres efêmero | Suíte automatizada |
| **Staging** | Vercel (preview) | host de aplicação | projeto Supabase próprio | Homologação |
| **Produção** | Vercel (production) | host de aplicação | projeto Supabase Pro | Operação real |

### 2.2 Isolamento de dados

Cada ambiente possui **banco próprio**. Staging e produção usam projetos
Supabase distintos — não schemas distintos no mesmo projeto —, de modo que um
erro em homologação não alcance dados reais.

O ambiente de teste é isolado por construção: a suíte automatizada se recusa a
executar sem `TEST_DATABASE_URL` configurada, em vez de recorrer ao banco padrão.
Essa proteção foi introduzida após resíduos de testes terem alcançado a base de
produção, e é verificada a cada execução.

### 2.3 Dados em staging

Staging não deve receber cópia integral da produção. Dados de clientes reais em
ambiente de homologação ampliam a superfície de exposição sem ganho
proporcional. A recomendação é manter um conjunto reduzido e representativo,
gerado por *seed*, com dados fictícios identificáveis como tal.

---

## 3. Esteira de deploy

### 3.1 Estratégia de branches

```
main ─────────●────────────●──────────────●────▶  produção
              ▲            ▲              ▲
dev ──●───●───┴──●───●─────┴───●──●───────┴────▶  staging
      ▲   ▲      ▲   ▲         ▲  ▲
   feature/*  feature/*     fix/*  feature/*
```

| Branch | Ambiente | Política |
|---|---|---|
| `feature/*`, `fix/*` | preview efêmero | Deploy automático por *pull request* |
| `dev` | staging | Integração contínua; deploy automático |
| `main` | produção | Protegida; recebe apenas *merge* revisado |

A branch `main` deve ter proteção habilitada no GitHub: exigir revisão de pelo
menos um mantenedor, exigir aprovação da verificação automatizada e bloquear
escrita direta.

### 3.2 Pipeline de verificação

Executado a cada *pull request*, antes de qualquer deploy:

```yaml
# .github/workflows/ci.yml (esboço)
name: Verificação
on: [pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: cross_test
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-retries 10
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
        working-directory: backend
      - run: npm run typecheck
        working-directory: backend
      - run: npm run db:migrate:test
        working-directory: backend
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/cross_test
      - run: npm test
        working-directory: backend
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/cross_test
      - run: npm run audit:prod
        working-directory: backend

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npm run typecheck
        working-directory: frontend
      - run: npm test
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
```

O banco PostgreSQL como *service container* elimina a dependência de banco
externo na verificação: a suíte roda contra uma instância efêmera, criada e
descartada a cada execução. Isso torna a verificação rápida e sem efeito
colateral.

### 3.3 Deploy do frontend

A Vercel integra-se diretamente ao repositório GitHub. Não é necessário
*workflow* próprio: cada *pull request* gera um ambiente de *preview* com URL
única, `dev` publica em staging e `main` em produção.

As variáveis `VITE_*` são embutidas no *bundle* durante o build, e não lidas em
tempo de execução. Consequentemente, cada ambiente exige seu próprio build, com
o valor correto de `VITE_API_URL` configurado no painel da Vercel por ambiente.

Nenhum segredo deve ser exposto como variável `VITE_*`: o conteúdo do *bundle* é
público por natureza.

### 3.4 Deploy da API

```yaml
# .github/workflows/deploy-api.yml (esboço)
name: Deploy da API
on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # exige aprovação, se configurado
    steps:
      - uses: actions/checkout@v4
      - name: Aplicar migrations
        run: |
          npm ci
          npm run db:migrate
        working-directory: backend
        env:
          MIGRATION_DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}
      - name: Publicar
        run: curl -fsS -X POST "${{ secrets.DEPLOY_HOOK_URL }}"
```

A ordem é significativa: **migrations antes da publicação**. O runner é
idempotente, aplica apenas o que está pendente e verifica o checksum das
migrations já aplicadas, impedindo alteração retroativa do histórico.

Migrations incompatíveis com a versão em execução exigem estratégia em duas
fases — adicionar a nova estrutura, migrar os dados, remover a antiga em release
posterior — ou janela de manutenção acordada.

---

## 4. Gestão de contas e acessos

### 4.1 Princípio de propriedade

Toda conta de serviço deve pertencer à **Cross Networking como pessoa
jurídica**, jamais a uma conta pessoal de colaborador. Contas criadas em nome
individual geram dependência operacional: desligamento, indisponibilidade ou
divergência com o colaborador podem bloquear o acesso à infraestrutura.

### 4.2 Configuração recomendada

| Provedor | Configuração |
|---|---|
| **GitHub** | Organização `cross-networking`, repositório de propriedade da organização |
| **Vercel** | Team account vinculado à organização, não a conta pessoal |
| **Supabase** | Organization com o projeto sob titularidade da empresa |
| **Cloudflare** | Conta corporativa; domínio registrado em nome da Cross Networking |

Cada provedor deve ter no mínimo **dois administradores** — tipicamente o
responsável técnico e um sócio ou diretor —, garantindo continuidade em caso de
ausência.

O e-mail de titularidade deve ser um endereço corporativo de função
(`tecnologia@crossnetworking.com.br`), não pessoal, permitindo transferência de
responsabilidade sem alteração de conta.

### 4.3 Níveis de acesso

| Perfil | GitHub | Vercel | Supabase | Cloudflare |
|---|---|---|---|---|
| Responsável técnico | Admin | Owner | Owner | Admin |
| Desenvolvedor | Write | Member | Developer | — |
| Colaborador externo | Write no fork | — | — | — |
| Diretoria | Admin (continuidade) | Owner | Owner | Admin |

Colaboradores externos trabalham por *fork* e *pull request*, sem acesso de
escrita ao repositório principal nem aos provedores de infraestrutura.

### 4.4 Autenticação e segredos de acesso

Autenticação em dois fatores deve ser **obrigatória** em todos os provedores.
No GitHub, a organização permite exigir 2FA de todos os membros — recomenda-se
habilitar.

Segredos de infraestrutura (chaves de API, tokens de deploy, credenciais de
banco) devem residir exclusivamente em cofres dos próprios provedores — GitHub
Secrets, variáveis de ambiente da Vercel, painel do Supabase. Não devem
trafegar por mensagem, e-mail ou documento compartilhado.

### 4.5 Procedimento de desligamento

Ao desligamento de qualquer pessoa com acesso: remover das organizações nos
quatro provedores, revogar tokens pessoais e **rotacionar os segredos aos quais
teve acesso** — `JWT_SECRET`, `METRICS_TOKEN`, senhas de banco e chaves de API
de terceiros. Remover acesso sem rotacionar segredos deixa credenciais válidas
em posse de quem já não deveria tê-las.

---

## 5. Segurança

### 5.1 Variáveis de ambiente

A aplicação valida a configuração na inicialização e **recusa iniciar** em
produção quando: `JWT_SECRET` ou `METRICS_TOKEN` estão ausentes, ou
`CORS_ORIGIN` está definido como `*`. A falha é imediata e explícita,
preferível a uma execução silenciosamente insegura.

| Variável | Produção |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | aleatório, 32+ caracteres |
| `METRICS_TOKEN` | aleatório, **distinto** de `JWT_SECRET` |
| `CORS_ORIGIN` | origem exata do frontend |
| `DATABASE_URL` | papel `cross_app` (sem DDL) |
| `TRUST_PROXY` | `true` apenas com proxy confiável à frente |

A aplicação conecta ao banco com papel de **privilégio mínimo** (`cross_app`),
sem permissão de DDL nem privilégios de superusuário. Migrations usam papel
administrativo separado, utilizado apenas pela esteira de deploy. Uma
comprometição da API, portanto, não alcança a estrutura do banco.

`TRUST_PROXY` habilitado sem proxy à frente permite que o cliente forje o
cabeçalho de origem e contorne o *rate limit*.

### 5.2 Proteção de borda

| Camada | Mecanismo |
|---|---|
| Cloudflare | Mitigação de DDoS, WAF, TLS gerenciado, cache |
| Aplicação | `helmet` (cabeçalhos), CORS por origem explícita |
| Aplicação | *Rate limit* de 300 req/min por IP |
| Aplicação | Limite de 1 MB no corpo da requisição |
| Banco | Consultas parametrizadas em toda a camada de repositório |

### 5.3 Autenticação

Tokens JWT com par de acesso (curta duração) e *refresh* (longa duração).
Senhas armazenadas com **scrypt**, comparadas em tempo constante mesmo quando o
usuário não existe — o tempo de resposta não revela quais endereços estão
cadastrados, impedindo enumeração de contas.

### 5.4 Autorização e Row Level Security

A autorização opera em duas dimensões complementares:

**Por persona** — determina *quais operações* o usuário pode executar:
`administrador`, `estrategista`, `gestor_contas`, `coordenador`.

**Por escopo de cliente** — determina *quais contas* o usuário pode visualizar.
Implementado na camada de serviço, com a decisão centralizada na função
`cross_core.usuario_pode_ver_cliente()`. O escopo restrito é opcional por
usuário: sem vínculos declarados, o acesso abrange todas as contas — adequado à
equipe interna de uma agência. Acesso a recurso fora do escopo responde **404**,
não 403, evitando que a existência de contas seja inferida por tentativa.

**Estado atual do RLS.** O PostgreSQL suporta *Row Level Security*, que aplica o
filtro no próprio banco, independentemente do código da aplicação. A plataforma
ainda **não tem RLS habilitado**: o isolamento depende da camada de serviço, e
uma consulta que omita o filtro contorna a restrição.

Com a operação atual — usuários internos, todos com acesso legítimo a todas as
contas — o risco é contido. **Recomenda-se habilitar RLS antes de conceder
acesso a usuários externos à Cross**, momento em que o isolamento passa a ser
requisito de confidencialidade entre clientes.

A função de decisão já existe e é compatível com políticas RLS, o que reduz a
implementação a declarar as políticas por tabela e habilitar o mecanismo.

### 5.5 Auditoria

A trilha de auditoria registra alterações com autor e horário, e é **imutável
por construção**: `UPDATE` e `DELETE` foram revogados na tabela, inclusive para
a aplicação. Registros não podem ser alterados nem removidos após a gravação.

### 5.6 Backups

| Camada | Mecanismo | Retenção |
|---|---|---|
| Supabase Pro | Backup diário automático | 7 dias |
| Supabase Pro | *Point-in-time recovery* | 7 dias |
| Aplicação | `npm run db:backup` (exportação comprimida) | conforme política |

O backup da aplicação exporta todos os schemas em arquivos comprimidos com
timestamp. A pasta de destino está fora do controle de versão — os arquivos
devem ser enviados a armazenamento externo (bucket ou drive corporativo) para
constituírem cópia efetiva.

**Backup não verificado não é backup.** Recomenda-se testar a restauração
periodicamente, em ambiente descartável, e registrar o resultado.

### 5.7 Monitoramento

| Sinal | Origem |
|---|---|
| Disponibilidade | `GET /health` (processo), `GET /readyz` (prontidão) |
| Conectividade com banco | `GET /health/db` |
| Provedores de IA | `GET /health/ai` |
| Métricas da aplicação | `GET /metrics` (autenticado por `METRICS_TOKEN`) |
| Logs estruturados | pino, JSON, com `x-request-id` por requisição |
| Métricas de infraestrutura | painéis de Vercel, Supabase e Cloudflare |

`GET /health` responde positivamente mesmo com o banco indisponível — verifica
apenas o processo. Monitoração de disponibilidade real deve consultar
`/health/db` ou `/readyz`.

Recomenda-se configurar verificação externa (*uptime check*) contra `/readyz` a
cada minuto, com alerta para canal acompanhado pela equipe.

### 5.8 Teste de intrusão

Um teste de intrusão verifica se o sistema **resiste** a tentativas de ataque —
distinto dos testes automatizados, que verificam se ele **funciona conforme
especificado**.

**Verificação realizada.** Em 31/07/2026 foi executada bateria de verificação
contra a aplicação em execução, cobrindo: requisições sem token, token forjado
com algoritmo `none`, assinatura adulterada, injeção de SQL em campos de busca,
exposição de hash de senha nas respostas e acesso a endpoints administrativos
sem autenticação. Todos os vetores foram rejeitados.

**Recomendação.** Para um teste formal, a modalidade mais adequada é *grey box*:
fornecer ao avaliador credenciais de usuário comum e solicitar tentativa de
acesso a dados de outra conta. É o cenário de maior risco em plataformas
multi-cliente.

O ponto que deve ser informado previamente ao avaliador é a ausência de RLS
(seção 5.4). Recomenda-se realizar o teste **após** a habilitação, para que o
resultado reflita a postura definitiva.

Ferramentas de verificação contínua, de menor custo, complementam sem
substituir: OWASP ZAP para varredura automatizada e `npm audit` para
vulnerabilidades conhecidas em dependências — este último já integrado à
esteira de verificação.

---

## 6. Custos

### 6.1 Estimativa inicial

| Item | Plano | Custo mensal |
|---|---|---|
| Vercel | Pro | US$ 20 |
| Supabase | Pro | US$ 25 |
| Host da API | 1 GB RAM, execução contínua | US$ 7–25 |
| Cloudflare | Free | US$ 0 |
| Domínio `.com.br` | — | ~R$ 40/ano |
| **Total** | | **US$ 52–70/mês** |

Configuração de entrada, adequada a validação inicial:

| Item | Plano | Custo mensal |
|---|---|---|
| Vercel | Hobby | US$ 0 |
| Supabase | Free | US$ 0 |
| Host da API | plano básico | US$ 7 |
| Cloudflare | Free | US$ 0 |
| **Total** | | **~US$ 7/mês** |

> Preços de serviços em nuvem são revisados com frequência. Recomenda-se
> confirmar os valores vigentes junto a cada provedor antes da contratação.

### 6.2 Considerações

**Vercel Hobby não permite uso comercial** conforme os termos de serviço. Para
operação da Cross Networking, o plano Pro é o adequado.

**Supabase Free suspende o projeto** após período de inatividade e não oferece
*point-in-time recovery*. Para dados de clientes, o plano Pro justifica-se pelos
backups automáticos e pela ausência de suspensão.

**Planos de hospedagem com hibernação** suspendem o processo após inatividade,
resultando em latência de 30 a 60 segundos na primeira requisição subsequente.
Para uso diário pela equipe, é inadequado; o plano pago mais básico já elimina o
comportamento.

**Custo de serviços de IA** é variável e não está incluído. O provedor é
configurável: Ollama executado localmente não tem custo por uso; DeepSeek e
OpenAI são cobrados por token consumido. Sem chave configurada, os agentes
operam em modo determinístico, sem custo.

---

## 7. Escalabilidade

### 7.1 Capacidade atual

A configuração proposta atende com folga o cenário de uso previsto — dezenas de
usuários internos, com volume de algumas requisições por minuto. O frontend, por
ser estático e distribuído por CDN, escala sem intervenção.

### 7.2 Escalabilidade por camada

**Frontend.** Já distribuído globalmente pela CDN. Não requer ação.

**API.** Escala verticalmente (mais memória e CPU) até um limite confortável, e
horizontalmente com múltiplas instâncias atrás de balanceador. Duas ressalvas
para o modo horizontal:

- O *rate limit* atualmente é mantido em memória por instância; com várias
  instâncias, deve migrar para armazenamento compartilhado (Redis).
- Os pipelines de IA executam no processo da API. Sob volume, devem ser
  extraídos para *worker* dedicado com fila.

**Banco.** É o componente que primeiro impõe limite. Caminho de evolução:
otimização de índices, upgrade do plano Supabase, réplicas de leitura para
relatórios e, em último caso, particionamento das tabelas de maior volume.

### 7.3 Marcos de evolução

| Marco | Ação recomendada |
|---|---|
| Segundo cliente com acesso | Habilitar RLS (seção 5.4) |
| Usuários externos à Cross | RLS obrigatório; revisar escopo por usuário |
| Uso intensivo dos agentes | Extrair para *worker* com fila |
| Múltiplas instâncias da API | *Rate limit* compartilhado; sessões já são *stateless* |
| Volume de relatórios | Réplica de leitura no Supabase |

### 7.4 Decisões que preservam a evolução

Algumas características já implementadas reduzem o custo de escalar:

**Autenticação sem estado.** Tokens JWT não exigem sessão em memória; múltiplas
instâncias podem atender o mesmo usuário sem afinidade de sessão.

**Migrations versionadas com checksum.** O schema evolui de forma auditável, com
histórico verificado a cada execução.

**Separação por schema de domínio.** As fronteiras entre áreas do sistema são
explícitas no banco, o que viabiliza extração de módulos caso a evolução exija.

**Frontend desacoplado.** Comunicação exclusivamente por API versionada (`/v1`),
permitindo evolução independente das camadas.

---

## 8. Referências

| Documento | Conteúdo |
|---|---|
| `docs/SAD.md` | Arquitetura de software, modelo de domínio, dívidas técnicas |
| `docs/DEPLOY.md` | Procedimentos operacionais detalhados |
| `backend/.env.example` | Catálogo de variáveis de ambiente |
| `backend/docs/ESPECIFICACAO_ROTAS.md` | Rotas por requisito funcional |

---

*Documento elaborado em 31/07/2026 a partir da análise do código em operação.
Os dados de arquitetura, segurança e cobertura de testes refletem verificação
executada na data.*
