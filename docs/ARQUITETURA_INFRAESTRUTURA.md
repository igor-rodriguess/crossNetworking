# Arquitetura de Infraestrutura e Operação

**Plataforma Cross** · Cross Networking
Documento técnico para o time de Tecnologia
Versão 2.0 — 31/07/2026

---

## Sumário executivo

Este documento descreve a infraestrutura proposta para colocar a Plataforma
Cross em produção: hospedagem, ambientes, esteira de deploy, gestão de acessos,
segurança, custo e escalabilidade.

A proposta prioriza **simplicidade operacional**. São três serviços gerenciados
e um repositório:

| Camada | Provedor | O que exige de operação |
|---|---|---|
| Frontend | **Vercel** | Conectar o repositório. Deploy automático a cada push. |
| Banco | **Supabase** | Já em uso. Backups e PITR gerenciados pelo provedor. |
| API | **Render** (ou equivalente) | Conectar o repositório. Deploy automático. |
| Borda | **Cloudflare** | Configuração de DNS uma única vez. |

Não há servidor para administrar, sistema operacional para atualizar ou
container para orquestrar. Os três serviços fazem build e deploy diretamente do
GitHub. A esteira de verificação roda no GitHub Actions.

**Custo estimado: US$ 52 a 70 por mês** em configuração profissional.

### Por que a API precisa de host próprio

A especificação inicial previa Supabase como backend completo, com Edge
Functions quando necessário. A verificação do código mostrou que essa
configuração não comporta a aplicação atual.

A API é uma aplicação **Node/Express com 234 rotas em 15 módulos de domínio**
(17.438 linhas). Edge Functions do Supabase executam Deno com tempo de vida
curto, o que impede dois comportamentos centrais do sistema:

**Pipelines de IA que continuam após a resposta.** O agendamento de tarefas
devolve o identificador imediatamente e prossegue processando por vários
minutos, gravando progresso no banco enquanto a interface consulta o estado. Em
execução efêmera, o processamento é encerrado junto com a resposta HTTP — o
pipeline morreria no meio.

**Estado entre requisições.** O pool de conexões PostgreSQL e o *rate limit* por
IP pressupõem um processo contínuo. Em funções isoladas, o pool não se
reaproveita e o limite deixa de ser efetivo, pois cada instância contaria
separadamente.

Reescrever 234 rotas como funções edge significaria refazer o backend, com
descarte de código em operação e coberto por 203 testes automatizados.

**A alternativa adotada não adiciona complexidade operacional.** Um host de
aplicação como Render conecta ao mesmo repositório GitHub e faz deploy
automático — o mesmo modelo da Vercel, aplicado à API. Custo de US$ 7 a 25 por
mês.

---

## 1. Estado atual da plataforma

Esta seção descreve o sistema como ele está em 31/07/2026, verificado
diretamente no código e no banco em operação.

### 1.1 Dimensão

| Indicador | Valor |
|---|---|
| Backend | 17.438 linhas · 111 arquivos · 15 módulos |
| Frontend | 13.444 linhas · 66 arquivos |
| Rotas da API | 234 |
| Migrations aplicadas | 54 |
| Tabelas no banco | 118, em 10 schemas |
| Agentes de IA | 13 |
| Testes automatizados | 203 (backend) + 27 (frontend) |
| Tamanho do banco | 25 MB |

### 1.2 Módulos de domínio

`admin` · `agentes` · `auth` · `clientes` · `docs` · `documentos` · `execucao` ·
`frentes` · `governanca` · `inteligencia` · `metodologias` · `parcerias` ·
`partes` · `projetos` · `resultados`

### 1.3 Dados em operação

| Entidade | Registros |
|---|---|
| Partes (marcas, organizações) | 67 |
| Clientes ativos | 2 |
| Projetos | 3 |
| Frentes de oportunidade | 18 |
| Candidaturas | 65 |
| Ativos de marca | 235 |
| Usuários internos | 1 |
| Registros de auditoria | 1.422 |

A plataforma está em **uso real**, com a operação da conta Grupo Aramis
carregada. Não se trata de protótipo: os dados acima são de trabalho corrente.

### 1.4 O que o sistema faz

A plataforma apoia a gestão de parcerias entre marcas, do mapeamento inicial ao
acompanhamento do que foi fechado:

- **Base de relacionamentos** — organizações, pessoas, perfil estratégico,
  ativos, públicos, territórios e praças
- **Mapeamento de oportunidades** — marcas candidatas organizadas por território
  e setor, com status operacional por conversa
- **Metodologias Cross** — Crossability (seis dimensões) e Cross Score Card
  (avaliação por critérios ponderados, com modelo próprio por cliente)
- **Pipeline de agentes de IA** — descoberta assistida de oportunidades, com
  curadoria humana obrigatória antes de qualquer registro na base
- **Execução e resultados** — parcerias formalizadas, entregas, indicadores, ROI

### 1.5 Stack

| Camada | Tecnologias |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind 3, Zustand |
| Backend | Node 22, Express 4, TypeScript, Zod, pino |
| Banco | PostgreSQL 16 (Supabase), pgvector |
| Testes | Vitest, Supertest, Testing Library |
| IA | Ollama, DeepSeek, OpenAI, Firecrawl (todos opcionais) |

O frontend usa **HashRouter** — as URLs têm formato `/#/rota`. Isso dispensa
configuração de *rewrite* no host estático.

Sem chaves de IA configuradas, os agentes operam em modo determinístico, o que
permite desenvolver e testar sem custo de inferência.

---

## 2. Arquitetura de infraestrutura

### 2.1 Topologia

```
                         ┌──────────────────────────┐
                         │       Cloudflare         │
                         │  DNS · TLS · CDN · DDoS  │
                         └────────────┬─────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
      app.crossnetworking.com.br              api.crossnetworking.com.br
                 │                                         │
     ┌───────────▼───────────┐                ┌────────────▼────────────┐
     │        Vercel         │  HTTPS / JSON  │         Render          │
     │   React (estático)    │───────────────▶│   Node · Express · TS   │
     │   build automático    │◀───────────────│   processo contínuo     │
     └───────────────────────┘                └────────────┬────────────┘
                 ▲                                         │ TLS
                 │                                         │
                 │ deploy                     ┌────────────▼────────────┐
                 │                            │        Supabase         │
     ┌───────────┴───────────┐                │ PostgreSQL 16 + pgvector│
     │        GitHub         │───── deploy ──▶│ Storage · Backup · PITR │
     │  código + Actions     │                └─────────────────────────┘
     └───────────────────────┘
```

### 2.2 Fluxo de uma requisição

1. O usuário acessa `app.crossnetworking.com.br`; o Cloudflare resolve o DNS e
   entrega o TLS, servindo o conteúdo estático pela CDN.
2. A aplicação React chama `api.crossnetworking.com.br/v1/...` com o token JWT.
3. O Cloudflare encaminha à API, aplicando proteção de borda.
4. A API valida o token, aplica a regra de negócio e consulta o Supabase.
5. A resposta retorna em JSON.

### 2.3 Domínios

| Domínio | Destino | Ambiente |
|---|---|---|
| `crossnetworking.com.br` | redireciona para `app.` | — |
| `app.crossnetworking.com.br` | Vercel | Produção |
| `api.crossnetworking.com.br` | Render | Produção |
| `staging.crossnetworking.com.br` | Vercel | Homologação |
| `api-staging.crossnetworking.com.br` | Render | Homologação |

A separação por subdomínio simplifica CORS, isola certificados e permite escalar
as camadas independentemente.

---

## 3. Ambientes

| Ambiente | Frontend | API | Banco | Uso |
|---|---|---|---|---|
| **Desenvolvimento** | local (Vite) | local | Postgres em Docker | Trabalho diário |
| **Teste** | — | — | Postgres efêmero | Suíte automatizada |
| **Staging** | Vercel | Render | projeto Supabase próprio | Homologação |
| **Produção** | Vercel | Render | Supabase Pro | Operação real |

### 3.1 Isolamento de dados

Cada ambiente tem **banco próprio**. Staging e produção usam projetos Supabase
distintos — não schemas distintos no mesmo projeto —, de modo que um erro em
homologação não alcance dados reais.

O ambiente de teste é isolado por construção: a suíte **se recusa a executar**
sem `TEST_DATABASE_URL` configurada, em vez de recorrer ao banco padrão. A
proteção foi adicionada após resíduos de testes terem alcançado a base de
produção em julho de 2026, e é verificada a cada execução.

### 3.2 Dados em staging

Staging não deve receber cópia integral da produção: dados reais de clientes em
ambiente de homologação ampliam a exposição sem ganho proporcional. Recomenda-se
conjunto reduzido e representativo, com dados fictícios identificáveis como tal.

---

## 4. Esteira de deploy

### 4.1 Modelo

Os três provedores fazem build e deploy **diretamente do GitHub**. Não há
artefato para publicar manualmente, imagem de container para construir ou
servidor para acessar.

```
    push / pull request
            │
            ▼
    ┌───────────────┐
    │ GitHub Actions│  typecheck · testes · build · audit
    └───────┬───────┘
            │ aprovado
            ▼
    ┌───────────────┐        ┌───────────────┐
    │    Vercel     │        │    Render     │
    │  (frontend)   │        │    (API)      │
    └───────────────┘        └───────────────┘
```

### 4.2 Estratégia de branches

```
main ─────────●────────────●──────────────●────▶  produção
              ▲            ▲              ▲
dev ──●───●───┴──●───●─────┴───●──●───────┴────▶  staging
      ▲   ▲      ▲   ▲         ▲  ▲
   feature/*  feature/*     fix/*  feature/*
```

| Branch | Ambiente | Política |
|---|---|---|
| `feature/*`, `fix/*` | preview efêmero | Deploy automático por pull request |
| `dev` | staging | Deploy automático |
| `main` | produção | Protegida; apenas merge revisado |

Recomenda-se proteger `main` no GitHub: exigir revisão de ao menos um
mantenedor, exigir aprovação da verificação automatizada e bloquear escrita
direta.

### 4.3 Verificação automatizada

```yaml
# .github/workflows/ci.yml
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
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/cross_test
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
      - run: npm test
        working-directory: backend
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

O PostgreSQL como *service container* elimina dependência de banco externo na
verificação: uma instância é criada e descartada a cada execução, tornando o
processo rápido e sem efeito colateral.

### 4.4 Frontend na Vercel

Basta conectar o repositório. Configuração:

| Campo | Valor |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

**Atenção às variáveis `VITE_*`:** são embutidas no *bundle* durante o build, e
não lidas em tempo de execução. Cada ambiente precisa do seu próprio build, com
`VITE_API_URL` configurada no painel da Vercel por ambiente (Production e
Preview). Nenhum segredo deve ser exposto como `VITE_*` — o conteúdo do bundle é
público.

### 4.5 API no Render

Também por conexão direta ao repositório:

| Campo | Valor |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/readyz` |

**Migrations.** Devem ser aplicadas **antes** da publicação da nova versão. Duas
opções:

*Automática*, adicionando ao Build Command:
```
npm ci && npm run db:migrate && npm run build
```

*Controlada*, por workflow com aprovação:
```yaml
# .github/workflows/deploy-api.yml
name: Deploy da API
on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # exige aprovação manual, se configurado
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
        working-directory: backend
      - run: npm run db:migrate
        working-directory: backend
        env:
          MIGRATION_DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}
      - run: curl -fsS -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"
```

O runner de migrations é idempotente: aplica apenas o pendente e verifica o
checksum das já aplicadas, impedindo alteração retroativa do histórico.

Migrations incompatíveis com a versão em execução exigem estratégia em duas
fases — adicionar, migrar os dados, remover em release posterior — ou janela de
manutenção acordada.

### 4.6 Cloudflare

Configuração única, no momento da implantação:

| Registro | Tipo | Destino | Proxy |
|---|---|---|---|
| `app` | CNAME | `cname.vercel-dns.com` | Ativado |
| `api` | CNAME | `<serviço>.onrender.com` | Ativado |
| `staging` | CNAME | `cname.vercel-dns.com` | Ativado |
| `api-staging` | CNAME | `<serviço-staging>.onrender.com` | Ativado |

Com o proxy ativado ("nuvem laranja"), o Cloudflare passa a fornecer TLS, cache
e mitigação de DDoS. O modo de TLS deve ser **Full (strict)**, já que Vercel e
Render fornecem certificado válido na origem.

### 4.7 Ordem em atualizações

A sequência importa quando há mudança de schema:

1. **Migrations** — compatíveis com a versão ainda em execução
2. **API** — nova versão do backend
3. **Frontend** — nova versão da interface

Migrations que quebram compatibilidade com a versão em execução exigem
estratégia em duas fases (adicionar a nova estrutura, migrar os dados, remover a
antiga em release posterior) ou janela de manutenção acordada.

### 4.8 Comandos equivalentes

O que os provedores executam automaticamente, para referência ou execução
manual:

```bash
# Backend
npm ci                 # instala conforme package-lock, sem resolver versões
npm run build          # TypeScript → dist/
npm run db:migrate     # aplica migrations pendentes
npm start              # node dist/src/server.js

# Frontend
npm ci
npm run build          # gera dist/ estático
```

---

## 5. Desenvolvimento local

O ambiente local não depende de nenhum serviço em nuvem, exceto o banco quando
se opta pelo Supabase de desenvolvimento.

```bash
# 1. Banco local (opcional; alternativa ao Supabase de desenvolvimento)
docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env   # preencher DATABASE_URL e demais variáveis
npm ci
npm run db:migrate
npm run dev            # http://localhost:3000

# 3. Frontend
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:3000/v1
npm ci
npm run dev            # http://localhost:5173
```

A interface abre em `http://localhost:5173/#/` — o `#` faz parte da rota
(HashRouter).

### 5.1 Suíte de testes

O backend exige banco de teste separado, e **recusa executar sem ele**:

```bash
docker compose up -d db-test     # Postgres efêmero na porta 5433
npm run db:migrate:test          # aplica o schema
npm test                         # 203 casos
```

O frontend não depende de banco:

```bash
cd frontend && npm test          # 27 casos, ~4 segundos
```

---

## 6. Gestão de contas e acessos

### 6.1 Princípio de propriedade

Toda conta de serviço deve pertencer à **Cross Networking como pessoa
jurídica**, nunca a uma conta pessoal de colaborador. Contas em nome individual
criam dependência operacional: desligamento, indisponibilidade ou divergência
com o colaborador podem bloquear o acesso à infraestrutura da empresa.

### 6.2 Configuração recomendada

| Provedor | Configuração |
|---|---|
| **GitHub** | Organização `cross-networking`; repositório de propriedade da organização |
| **Vercel** | Team account vinculado à organização, não a conta pessoal |
| **Supabase** | Organization com o projeto sob titularidade da empresa |
| **Render** | Team account corporativo |
| **Cloudflare** | Conta corporativa; domínio registrado em nome da Cross Networking |

Cada provedor deve ter no mínimo **dois administradores** — tipicamente o
responsável técnico e um sócio ou diretor —, garantindo continuidade em caso de
ausência.

O e-mail de titularidade deve ser corporativo e de função
(`tecnologia@crossnetworking.com.br`), não pessoal, permitindo transferência de
responsabilidade sem troca de conta.

### 6.3 Níveis de acesso

| Perfil | GitHub | Vercel | Supabase | Render | Cloudflare |
|---|---|---|---|---|---|
| Responsável técnico | Admin | Owner | Owner | Admin | Admin |
| Desenvolvedor | Write | Member | Developer | Member | — |
| Colaborador externo | Fork + PR | — | — | — | — |
| Diretoria | Admin | Owner | Owner | Admin | Admin |

Colaboradores externos trabalham por *fork* e *pull request*, sem escrita no
repositório principal nem acesso aos provedores.

### 6.4 Autenticação e segredos

Autenticação em dois fatores **obrigatória** em todos os provedores. No GitHub, a
organização permite exigir 2FA de todos os membros — recomenda-se habilitar.

Segredos de infraestrutura (chaves de API, tokens de deploy, credenciais de
banco) devem residir exclusivamente nos cofres dos provedores — GitHub Secrets,
variáveis de ambiente da Vercel e do Render, painel do Supabase. Não devem
trafegar por mensagem, e-mail ou documento compartilhado.

### 6.5 Desligamento de pessoas

Ao desligamento de alguém com acesso: remover das organizações nos cinco
provedores, revogar tokens pessoais e **rotacionar os segredos aos quais teve
acesso** — `JWT_SECRET`, `METRICS_TOKEN`, senhas de banco e chaves de API de
terceiros.

Remover acesso sem rotacionar segredos deixa credenciais válidas em posse de
quem já não deveria tê-las.

---

## 7. Segurança

### 7.1 Variáveis de ambiente

A aplicação valida a configuração na inicialização e **recusa iniciar** em
produção quando `JWT_SECRET` ou `METRICS_TOKEN` estão ausentes, ou quando
`CORS_ORIGIN` está definido como `*`. A falha é imediata e explícita, preferível
a uma execução silenciosamente insegura.

| Variável | Produção |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | aleatório, 32+ caracteres |
| `METRICS_TOKEN` | aleatório, **distinto** de `JWT_SECRET` |
| `CORS_ORIGIN` | origem exata do frontend |
| `DATABASE_URL` | papel `cross_app` (sem DDL) |
| `TRUST_PROXY` | `true` (atrás de Cloudflare e Render) |

A aplicação conecta ao banco com papel de **privilégio mínimo** (`cross_app`),
sem DDL e sem privilégios de superusuário. Migrations usam papel administrativo
separado, empregado apenas pela esteira de deploy. Uma comprometição da API,
portanto, não alcança a estrutura do banco.

### 7.2 Proteção de borda

| Camada | Mecanismo |
|---|---|
| Cloudflare | Mitigação de DDoS, WAF, TLS gerenciado, cache |
| Aplicação | `helmet` (cabeçalhos de segurança) |
| Aplicação | CORS por origem explícita |
| Aplicação | Rate limit de 300 req/min por IP |
| Aplicação | Limite de 1 MB no corpo da requisição |
| Banco | Consultas parametrizadas em toda a camada de repositório |

### 7.3 Autenticação

Tokens JWT com par de acesso (curta duração) e *refresh* (longa duração).
Senhas com **scrypt**, comparadas em tempo constante mesmo quando o usuário não
existe — o tempo de resposta não revela quais endereços estão cadastrados,
impedindo enumeração de contas.

### 7.4 Autorização e Row Level Security

A autorização opera em duas dimensões:

**Por persona** — determina *quais operações* o usuário pode executar:
`administrador`, `estrategista`, `gestor_contas`, `coordenador`.

**Por escopo de cliente** — determina *quais contas* o usuário pode ver.
Implementado na camada de serviço, com a decisão centralizada na função
`cross_core.usuario_pode_ver_cliente()`. O escopo restrito é opcional por
usuário: sem vínculos declarados, o acesso abrange todas as contas — adequado à
equipe interna de uma agência. Acesso fora do escopo responde **404**, não 403,
para que a existência de contas não seja inferida por tentativa.

**Estado atual: RLS não habilitado.** A verificação no banco confirma **zero
tabelas** com *Row Level Security* ativo. O isolamento entre clientes depende da
camada de serviço; uma consulta que omita o filtro contorna a restrição.

Com a operação atual — 1 usuário interno, com acesso legítimo a todas as contas
— o risco é contido. **Recomenda-se habilitar RLS antes de conceder acesso a
usuários externos à Cross**, quando o isolamento passa a ser requisito de
confidencialidade entre clientes.

A função de decisão já existe e é compatível com políticas RLS, o que reduz a
implementação a declarar as políticas por tabela e habilitar o mecanismo.

### 7.5 Auditoria

A trilha registra alterações com autor e horário — 1.422 registros até o
momento — e é **imutável por construção**: `UPDATE` e `DELETE` foram revogados
na tabela, inclusive para a aplicação.

### 7.6 Backups

| Camada | Mecanismo | Retenção |
|---|---|---|
| Supabase Pro | Backup diário automático | 7 dias |
| Supabase Pro | Point-in-time recovery | 7 dias |
| Aplicação | `npm run db:backup` | conforme política |

O backup da aplicação exporta todos os schemas em arquivos comprimidos com
timestamp. A pasta de destino está fora do controle de versão — os arquivos
precisam ser enviados a armazenamento externo para constituírem cópia efetiva.

Restauração por tabela:

```bash
gunzip -c <arquivo>.copy.gz | psql "<conexão>" -c "COPY <schema>.<tabela> FROM STDIN"
```

**Backup não verificado não é backup.** Recomenda-se testar a restauração
periodicamente, em ambiente descartável, registrando o resultado.

### 7.7 Monitoramento

| Sinal | Origem |
|---|---|
| Processo vivo | `GET /health` |
| Prontidão | `GET /readyz` |
| Conectividade com banco | `GET /health/db` |
| Provedores de IA | `GET /health/ai` |
| Métricas | `GET /metrics` (autenticado por `METRICS_TOKEN`) |
| Logs estruturados | pino, JSON, com `x-request-id` por requisição |
| Infraestrutura | painéis de Vercel, Render, Supabase e Cloudflare |

`GET /health` responde positivamente mesmo com o banco fora — verifica apenas o
processo. A monitoração de disponibilidade real deve consultar `/readyz`.

Recomenda-se verificação externa (*uptime check*) contra `/readyz` a cada
minuto, com alerta para canal acompanhado pela equipe.

### 7.8 Teste de intrusão

Um teste de intrusão verifica se o sistema **resiste** a tentativas de ataque —
distinto dos testes automatizados, que verificam se ele **funciona conforme
especificado**.

**Verificação já realizada.** Em 31/07/2026 foi executada bateria contra a
aplicação em execução, cobrindo requisições sem token, token forjado com
algoritmo `none`, assinatura adulterada, injeção de SQL em campos de busca,
exposição de hash de senha nas respostas e acesso a endpoints administrativos
sem autenticação. **Todos os vetores foram rejeitados.**

**Recomendação para o teste formal.** A modalidade mais adequada é *grey box*:
fornecer credenciais de usuário comum e solicitar tentativa de acesso a dados de
outra conta — cenário de maior risco em plataformas multi-cliente.

O ponto a informar previamente ao avaliador é a ausência de RLS (seção 7.4).
Recomenda-se realizar o teste **após** a habilitação, para que o resultado
reflita a postura definitiva.

Ferramentas de verificação contínua complementam sem substituir: OWASP ZAP para
varredura automatizada e `npm audit` para vulnerabilidades em dependências —
este já integrado à esteira (`npm run audit:prod`, atualmente sem
vulnerabilidades em produção).

---

## 8. Custos

### 8.1 Configuração profissional

| Item | Plano | Custo mensal |
|---|---|---|
| Vercel | Pro | US$ 20 |
| Supabase | Pro | US$ 25 |
| Render | Starter (1 GB) | US$ 7–25 |
| Cloudflare | Free | US$ 0 |
| Domínio `.com.br` | — | ~R$ 40/ano |
| **Total** | | **US$ 52–70/mês** |

### 8.2 Configuração de entrada

Para validação inicial, antes da operação plena:

| Item | Plano | Custo mensal |
|---|---|---|
| Vercel | Hobby | US$ 0 |
| Supabase | Free | US$ 0 |
| Render | Starter | US$ 7 |
| Cloudflare | Free | US$ 0 |
| **Total** | | **~US$ 7/mês** |

> Preços de serviços em nuvem são revisados com frequência. Recomenda-se
> confirmar os valores vigentes junto a cada provedor antes da contratação.

### 8.3 Ressalvas relevantes

**Vercel Hobby não permite uso comercial** conforme os termos de serviço. Para
operação da Cross Networking, o plano Pro é o adequado.

**Supabase Free suspende o projeto** após período de inatividade e não oferece
point-in-time recovery. Para dados de clientes, o Pro justifica-se pelos backups
automáticos e pela ausência de suspensão. O banco atual ocupa 25 MB — bem dentro
do limite de qualquer plano; a escolha se dá por confiabilidade, não capacidade.

**Planos com hibernação** suspendem o processo após inatividade, resultando em
30 a 60 segundos de latência na primeira requisição. Inadequado para uso diário;
o plano pago mais básico elimina o comportamento.

**Custo de IA é variável** e não está incluído. O provedor é configurável:
Ollama executado localmente não tem custo por uso; DeepSeek e OpenAI cobram por
token. Sem chave configurada, os agentes operam em modo determinístico, sem
custo.

---

## 9. Escalabilidade

### 9.1 Capacidade atual

A configuração proposta atende com folga o cenário previsto — dezenas de
usuários internos, com volume de algumas requisições por minuto. O banco ocupa
25 MB, e o frontend, sendo estático e distribuído por CDN, escala sem
intervenção.

### 9.2 Evolução por camada

**Frontend.** Já distribuído globalmente. Não requer ação.

**API.** Escala verticalmente até um limite confortável, e horizontalmente com
múltiplas instâncias atrás de balanceador. Duas ressalvas para o modo
horizontal:

- O *rate limit* é mantido em memória por instância; com várias instâncias, deve
  migrar para armazenamento compartilhado (Redis).
- Os pipelines de IA executam no processo da API. Sob volume, devem ser
  extraídos para *worker* dedicado com fila.

**Banco.** É o componente que primeiro impõe limite. Caminho: otimização de
índices, upgrade do plano Supabase, réplicas de leitura para relatórios e, em
último caso, particionamento das tabelas de maior volume.

### 9.3 Marcos de evolução

| Marco | Ação recomendada |
|---|---|
| Segundo cliente com acesso próprio | Habilitar RLS (seção 7.4) |
| Usuários externos à Cross | RLS obrigatório; revisar escopo por usuário |
| Uso intensivo dos agentes de IA | Extrair para worker com fila |
| Múltiplas instâncias da API | Rate limit compartilhado (sessões já são stateless) |
| Volume de relatórios | Réplica de leitura no Supabase |

### 9.4 Decisões que preservam a evolução

Características já implementadas que reduzem o custo de escalar:

**Autenticação sem estado.** Tokens JWT dispensam sessão em memória; múltiplas
instâncias atendem o mesmo usuário sem afinidade.

**Migrations versionadas com checksum.** O schema evolui de forma auditável,
com histórico verificado a cada execução.

**Separação por schema de domínio.** As 118 tabelas estão distribuídas em 10
schemas por área, o que torna as fronteiras explícitas e viabiliza extração de
módulos caso a evolução exija.

**Frontend desacoplado.** Comunicação exclusivamente por API versionada
(`/v1`), permitindo evolução independente das camadas.

**Provedor de IA plugável.** Trocar entre Ollama, DeepSeek e OpenAI é
configuração, não alteração de código.

---

## 10. Limitações conhecidas

Registradas para que a avaliação seja informada:

| Limitação | Situação | Recomendação |
|---|---|---|
| RLS não habilitado | 0 de 118 tabelas | Habilitar antes de acesso externo |
| Rate limit em memória | Por instância | Migrar para Redis ao escalar horizontalmente |
| Agentes no processo da API | Disputam recursos | Extrair para worker sob volume |
| Cobertura de frontend | 27 testes, sem interação de página | Ampliar conforme a interface estabiliza |
| Semântica de domínio | "Projeto" em revisão com a equipe | Definir antes de carregar novas contas |

---

## 11. Solução de problemas

Situações recorrentes e suas causas, registradas a partir de ocorrências reais:

**A suíte de testes não executa: "TEST_DATABASE_URL não definida"**
Comportamento esperado, não falha. A suíte se recusa a rodar contra o banco de
produção. Suba `db-test` e aplique o schema (seção 5.1).

**O runner acusa migration já aplicada como modificada**
Se o arquivo não foi editado, trata-se de diferença de fim de linha: o git
converte LF/CRLF entre plataformas, alterando o checksum sem alterar o conteúdo.
O `.gitattributes` fixa LF no repositório e o runner normaliza antes de calcular
o checksum — verifique se ambos estão presentes.

**Interface sem estilo, console do navegador limpo**
Tela renderizada como HTML puro indica que o Tailwind não foi processado. Causa
frequente em desenvolvimento: mais de um processo Vite disputando a mesma porta.
Encerre todos, remova `node_modules/.vite` e suba apenas um.

**Primeira requisição do dia demora cerca de um minuto**
Plano de hospedagem com hibernação. Migre para plano que mantenha o processo
ativo (seção 8.3).

**A interface abre em branco**
Verifique se a URL inclui o `#` — a aplicação usa HashRouter, e
`app.crossnetworking.com.br/clientes` não resolve; o correto é
`app.crossnetworking.com.br/#/clientes`.

---

## 12. Referências

| Documento | Conteúdo |
|---|---|
| `docs/SAD.md` | Arquitetura de software, modelo de domínio, dívidas técnicas |
| `backend/.env.example` | Catálogo comentado de variáveis de ambiente |
| `backend/docs/ESPECIFICACAO_ROTAS.md` | Rotas por requisito funcional |
| `docs/agents/AGENT_RUNTIME_CONTEXT.md` | Contexto de runtime dos agentes de IA |

---

*Documento elaborado em 31/07/2026 a partir de verificação direta do código e do
banco em operação. Indicadores de dimensão, dados e postura de segurança
refletem o estado apurado na data.*
