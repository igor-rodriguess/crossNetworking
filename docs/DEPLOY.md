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

> **Atenção a um mal-entendido comum:** o Supabase hospeda o **banco**, não a
> API Express. Ele oferece Postgres, Auth, Storage e Edge Functions (Deno) — mas
> um backend Node de longa duração precisa de outro provedor.

### 1.1 Domínio sugerido

```
app.crossnetworking.com.br   → frontend
api.crossnetworking.com.br   → backend
```

Separar por subdomínio simplifica CORS, certificados e permite escalar as duas
camadas de forma independente.

### 1.2 Região

O banco está em `us-east-2` (Ohio). **Hospede o backend na mesma região ou o
mais próximo possível**: cada requisição faz várias idas e voltas ao banco, e
latência entre continentes se acumula (backend no Brasil com banco em Ohio custa
~100–150 ms por requisição, só de rede).

---

## 2. Dimensionamento e custo

O backend é leve: recebe requisição, consulta o Postgres, devolve JSON. Não faz
processamento pesado — o trabalho de banco fica no Supabase e o de IA em serviço
externo. **512 MB de RAM atendem; 1 GB dá folga.**

Para a equipe da Cross (dezenas de pessoas, não milhares), a carga é baixa.

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

Checklist antes de expor a plataforma:

- [ ] `CORS_ORIGIN` com as origens exatas (nunca `*`)
- [ ] `JWT_SECRET` e `METRICS_TOKEN` aleatórios e diferentes entre si
- [ ] HTTPS obrigatório (fornecido pelos provedores citados)
- [ ] `DATABASE_URL` com o papel `cross_app` (sem DDL)
- [ ] `TRUST_PROXY=true` apenas se houver proxy confiável à frente
- [ ] Backups verificados e restauração testada
- [ ] Rotação de segredos definida
- [ ] **RLS habilitado** antes de conceder acesso a usuários externos à Cross

O último item é a dívida registrada no SAD (seção 9.1). O escopo por cliente
existe na camada de serviço; enquanto o banco não tiver políticas de RLS, uma
consulta que esqueça o filtro contorna o isolamento.

### 7.1 Sobre pentest

Um teste de invasão (*pentest*) verifica se o sistema **resiste** a um ataque —
diferente dos testes automatizados, que verificam se ele **funciona**.

Verificação executada em 31/07/2026 cobriu: acesso sem token, token forjado
(`alg=none`), assinatura adulterada, SQL injection, vazamento de hash de senha e
exposição de endpoints sensíveis. Todos os vetores foram rejeitados.

O gap conhecido, a ser informado a quem conduzir o pentest formal, é
**autorização multi-tenant**: o isolamento por cliente é recente e ainda não tem
enforcement no banco.

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
