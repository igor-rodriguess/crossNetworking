# Operação de produção

Este backend já inclui controles no código, mas só deve receber tráfego real
depois de este checklist ser atendido e registrado pela equipe responsável.

## Configuração obrigatória

- `NODE_ENV=production`.
- `JWT_SECRET` e `METRICS_TOKEN` diferentes, aleatórios e com 32+ caracteres,
  fornecidos por um cofre de segredos — nunca pelo Git, `.env` compartilhado ou
  imagem de container.
- `CORS_ORIGIN` contém somente os domínios publicados, separados por vírgula;
  o processo se recusa a iniciar com `*` em produção.
- `DATABASE_SSL_STRICT=true` quando a cadeia de certificados do banco estiver
  disponível; a conexão precisa usar TLS.
- `TRUST_PROXY=true` apenas atrás de proxy/balanceador controlado. Configure o
  proxy para remover cabeçalhos `X-Forwarded-*` vindos da internet.
- A conta da API usa `cross_app`; migrations usam a conta administrativa
  separada. Revise os grants depois de aplicar a migration 025.

## Sondas e monitoramento

- `GET /health`: liveness; não consulta o banco.
- `GET /readyz`: readiness; retorna `503` se o PostgreSQL não responder.
- `GET /health/db`: diagnóstico de migrations, restrito à rede interna.
- `GET /metrics`: métricas Prometheus agregadas; requer
  `Authorization: Bearer <METRICS_TOKEN>`. Não expõe IP, usuário, token ou URL
  com parâmetros.

Crie alertas ao menos para indisponibilidade de `/readyz`, taxa 5xx, taxa 429,
latência por rota, conexões/locks do banco e falha de backup.

No desligamento (`SIGTERM`/`SIGINT`), a API passa a responder `503 draining` em
`/readyz`, para de aceitar conexões e aguarda até `SHUTDOWN_TIMEOUT_MS` antes
de encerrar. O orquestrador deve remover a instância do balanceador ao receber
esse status e enviar `SIGTERM` com período de graça maior que esse valor.

## Antes de cada publicação

1. `npm ci && npm run typecheck && npm run audit:prod && npm test && npm run build`.
2. `npm run db:status` e aplicar migrations pela conta de migration.
3. Fazer backup e testar restauração em ambiente isolado.
4. Rodar scanner de dependências no CI e corrigir vulnerabilidades relevantes.
5. Fazer teste de carga contra staging, com limites e SLOs definidos.

## Controles que exigem decisão de negócio

RLS por cliente/equipe, retenção e anonimização LGPD, RPO/RTO, frequência de
backup e acesso a logs são políticas organizacionais. Elas precisam ser
definidas pela empresa e então transformadas em migrations e configuração de
infraestrutura; não devem ser inferidas pelo código.
