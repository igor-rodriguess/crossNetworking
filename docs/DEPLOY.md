# Deploy e operação — Plataforma Cross

Guia de hospedagem, configuração e operação. Complementa o [SAD](SAD.md), que
descreve a arquitetura.

Última revisão: 31/07/2026

---

## 1. Topologia

A plataforma tem três peças com necessidades diferentes de hospedagem:

| Peça | O que é | Onde hospedar |
|---|---|---|
| **Banco** | PostgreSQL 16 | Supabase (já em uso) |
| **Backend** | processo Node de longa duração | serviço de aplicação (Render, Railway, Fly.io, AWS…) |
| **Frontend** | HTML/CSS/JS estático | CDN ou host estático (Vercel, Netlify, Cloudflare Pages) |

O Supabase hospeda o **banco**. A API Express precisa de outro provedor: o
Supabase oferece Edge Functions, mas são Deno e de execução curta, não um
processo Node contínuo.

### 1.1 Por que um processo contínuo, e não serverless

A maior parte da API é CRUD sobre o Postgres e caberia bem em funções
serverless. Duas características do sistema, porém, exigem um processo que
permaneça vivo entre requisições:

**Tarefas de IA que continuam depois da resposta.** `agendarPipeline()` cria a
tarefa, devolve o identificador imediatamente e segue processando em segundo
plano (`executarTarefaEmSegundoPlano`), gravando progresso no banco enquanto a
interface faz *polling*. Um pipeline de descoberta percorre planejamento,
coleta, verificação, extração e raciocínio — trabalho de minutos. Em serverless,
a execução é encerrada assim que a resposta é enviada, e o pipeline morreria no
meio. O próprio código reconhece esse risco: `recuperarTarefasInterrompidas()`
roda na inicialização para encerrar tarefas que ficaram presas após uma queda.

**Estado em memória entre requisições.** O pool de conexões do Postgres, o
*rate limit* por IP e o aquecimento do modelo local (`aquecerOllama`) pressupõem
continuidade. Em funções isoladas, cada invocação recomeça — o pool não se
reaproveita (problema conhecido de serverless com Postgres) e o rate limit
deixaria de valer, já que cada instância contaria separadamente.

**Se a plataforma abrir mão dos agentes de IA assíncronos**, o restante da API
roda em serverless sem impedimento — as rotas de domínio são requisição/resposta
comuns. Manter os agentes exige um processo contínuo, ou extraí-los para um
*worker* separado com fila (arquitetura maior, que hoje não se justifica).

Para a escala da Cross — dezenas de usuários internos —, um único processo com
1 GB de RAM atende com folga, e é a opção mais simples de operar.

### 1.2 Domínio

```
app.crossnetworking.com.br   → frontend
api.crossnetworking.com.br   → backend
```

Separar por subdomínio simplifica CORS, certificados e permite escalar as duas
camadas de forma independente.

### 1.3 Região

O banco está em `us-east-2` (Ohio). **Hospede o backend na mesma região ou o
mais próximo possível**: cada requisição faz várias idas e voltas ao banco, e
latência entre continentes se acumula (backend no Brasil com banco em Ohio custa
~100–150 ms por requisição, só de rede).

---

## 2. Dimensionamento e custo

O backend é leve: recebe requisição, consulta o Postgres, devolve JSON. O
trabalho de banco fica no Supabase e a inferência de IA em serviço externo
(Ollama, DeepSeek ou OpenAI) — o processo Node apenas orquestra. **512 MB de RAM
atendem; 1 GB dá folga.**

Para a equipe da Cross — dezenas de pessoas, não milhares — a carga é baixa: a
plataforma responde a algumas requisições por minuto, não por segundo.

Um ponto de atenção no dimensionamento: os pipelines de IA rodam **dentro do
processo da API** (seção 1.1). Um pipeline em execução ocupa memória e CPU do
mesmo processo que atende as requisições. Com uso esporádico, isso é irrelevante;
se a descoberta de oportunidades passar a rodar em volume, vale extrair os
agentes para um worker separado antes de simplesmente aumentar a máquina.

| Item | Faixa mensal |
|---|---|
| Backend (1 GB, sempre ligado) | US$ 7–15 |
| Supabase Pro | US$ 25 |
| Frontend (host estático) | grátis nos planos usuais |
| Domínio `.com.br` | ~R$ 40/ano |
| **Total aproximado** | **US$ 35–40/mês** |

> Preços de cloud mudam com frequência — confirme no provedor antes de decidir.

**Evite planos que hibernam.** Vários planos gratuitos suspendem o serviço após
inatividade, e a primeira requisição seguinte demora 30–60 s. Para uso diário da
equipe, isso inviabiliza. O plano pago mais básico já resolve.

**Por que o Supabase Pro:** o plano Free pausa o projeto após cerca de uma
semana sem uso e não oferece *point-in-time recovery*. Para dados de cliente, o
Pro se justifica pelos backups automáticos.

---

## 3. Configuração

Todas as variáveis estão documentadas em `backend/.env.example`. As que **mudam
em produção**:

```bash
NODE_ENV=production

# Origens exatas — a aplicação recusa iniciar com "*" em produção
CORS_ORIGIN=https://app.crossnetworking.com.br

# Segredos distintos, aleatórios, 32+ caracteres
JWT_SECRET=<openssl rand -base64 48>
METRICS_TOKEN=<outro valor, diferente do JWT_SECRET>

# Papel de privilégio mínimo (sem DDL)
DATABASE_URL=postgresql://cross_app.<ref>:<senha>@aws-1-us-east-2.pooler.supabase.com:5432/postgres

# Só se a API estiver atrás de proxy confiável (necessário para rate limit por IP)
TRUST_PROXY=true
```

O frontend precisa de `VITE_API_URL` **no momento do build** — variáveis Vite
são embutidas no bundle, não lidas em runtime:

```bash
VITE_API_URL=https://api.crossnetworking.com.br/v1
```

### 3.1 Validações automáticas

A aplicação **recusa iniciar** em produção se faltar `JWT_SECRET` ou
`METRICS_TOKEN`, ou se `CORS_ORIGIN` for `*`. É proposital: falha alta e cedo em
vez de subir inseguro.

---

## 4. Procedimento de deploy

### 4.1 Backend

```bash
npm ci                 # instala exatamente o package-lock
npm run build          # TypeScript → dist/
npm run db:migrate     # aplica migrations pendentes
npm start              # node dist/src/server.js
```

Ordem importa: **migrations antes de subir a nova versão**. O runner é
idempotente — aplica só o que falta e verifica o checksum do que já foi
aplicado.

Configure o *health check* do provedor para `GET /health` (liveness) e, se
suportar prontidão separada, `GET /readyz` (verifica o banco).

### 4.2 Frontend

```bash
npm ci
npm run build          # gera dist/ estático
```

Publique `dist/`. A aplicação usa **HashRouter** (`/#/rota`), então não é
necessário configurar rewrite de SPA no host.

### 4.3 Ordem em atualizações

1. Migrations (compatíveis com a versão em execução)
2. Backend
3. Frontend

Migrations que quebram compatibilidade exigem janela de manutenção ou estratégia
em duas fases (adicionar, migrar, remover depois).

---

## 5. Operação

### 5.1 Verificação de saúde

| Endpoint | Responde |
|---|---|
| `GET /health` | processo vivo |
| `GET /health/db` | banco acessível |
| `GET /readyz` | pronto para receber tráfego |
| `GET /metrics` | métricas (exige `Authorization: Bearer <METRICS_TOKEN>`) |

`/health` retorna `ok` mesmo com o banco fora — para saber se a plataforma está
realmente utilizável, consulte `/health/db`.

### 5.2 Logs

Estruturados em JSON (pino), com `x-request-id` por requisição para correlação.
Nível via `LOG_LEVEL`. Não registre `LOG_LEVEL=debug` em produção por longos
períodos: o volume cresce rápido.

### 5.3 Backup

```bash
npm run db:backup      # backend/backups/<timestamp>/*.copy.gz
```

Exporta todos os schemas `cross_*` comprimidos. **A pasta `backups/` está no
`.gitignore`** — os dados não vão para o repositório, o que é correto, mas
significa que a cópia é local. Para proteção real, envie os arquivos para outro
lugar (drive, bucket) e combine com o PITR do Supabase.

Restauração por tabela:

```bash
gunzip -c <arquivo>.copy.gz | psql "<conn>" -c "COPY <schema>.<tabela> FROM STDIN"
```

Teste a restauração periodicamente — backup nunca verificado não é backup.

---

## 6. Ambientes

| Ambiente | Banco | Uso |
|---|---|---|
| Desenvolvimento | Supabase ou Postgres local (`docker compose up -d db`) | dia a dia |
| Teste | `db-test` em Docker, porta 5433, efêmero | suíte automatizada |
| Produção | Supabase Pro | operação real |

**O ambiente de teste é isolado por construção**: sem `TEST_DATABASE_URL`, a
suíte se recusa a rodar em vez de escrever na base real. Ver SAD, seção 8.

---

## 7. Segurança em produção

A configuração exigida em produção está descrita na seção 3; a aplicação recusa
iniciar se `JWT_SECRET` ou `METRICS_TOKEN` estiverem ausentes, ou se
`CORS_ORIGIN` for `*`. HTTPS é fornecido pelos provedores citados. A conexão da
aplicação usa o papel `cross_app`, sem DDL e sem superusuário, de modo que uma
eventual comprometição da API não alcance a estrutura do banco.

`TRUST_PROXY` só deve ser habilitado quando houver proxy confiável à frente:
com ele ligado sem proxy, o rate limit passa a confiar em cabeçalho que o
cliente pode forjar.

### 7.1 Postura verificada

Verificação executada em 31/07/2026 contra a aplicação em execução cobriu
acesso sem token, token forjado com `alg=none`, assinatura adulterada, injeção
de SQL em campos de busca, vazamento de hash de senha nas respostas e exposição
de endpoints administrativos. Todos os vetores foram rejeitados.

As proteções de borda em vigor: `helmet` para cabeçalhos, CORS por origem
explícita, rate limit de 300 requisições por minuto por IP, limite de 1 MB no
corpo da requisição, e consultas parametrizadas em toda a camada de repositório.
Senhas usam scrypt, comparadas em tempo constante mesmo quando o usuário não
existe — o tempo de resposta não revela quais e-mails estão cadastrados.

### 7.2 Limitação conhecida: isolamento entre clientes

O escopo por cliente (SAD, seção 4.2) é aplicado na camada de serviço. Enquanto
o banco não tiver políticas de *Row Level Security*, uma consulta que esqueça o
filtro contorna o isolamento — o banco não recusaria por conta própria.

Com a operação atual, restrita à equipe interna da Cross, o risco é contido.
A recomendação é habilitar RLS **antes** de conceder acesso a usuários externos,
e é o principal ponto a informar a quem conduzir um teste de invasão formal.

---

## 8. Solução de problemas

**A suíte não roda: "TEST_DATABASE_URL não definida"**
Comportamento esperado — a suíte não roda contra produção. Suba `db-test` e
aplique o schema (SAD, seção 8).

**Runner acusa migration já aplicada como modificada**
Se o arquivo não foi editado, é diferença de fim de linha. O `.gitattributes`
fixa LF no repositório e o runner normaliza antes do checksum; garanta que ambos
estão presentes.

**Frontend sem estilo, console limpo**
Tela em HTML puro indica que o PostCSS/Tailwind não processou. Causa comum: mais
de um processo Vite disputando a porta. Encerre todos, remova
`node_modules/.vite` e suba um só.

**Primeira requisição do dia demora ~1 min**
Plano com hibernação. Migre para um plano que mantenha o serviço ativo.
