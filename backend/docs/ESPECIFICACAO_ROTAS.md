# Especificação de Rotas REST — Plataforma Cross

Especificação completa dos endpoints do backend, com cobertura de 100% dos Requisitos Funcionais (RF001–RF051). Serve de guia para implementação em TDD.

## Convenções

- Prefixo **`/v1`** em todas as rotas de negócio; `/health` fica sem versão.
- Recursos em **português, no plural** (`/v1/partes`, `/v1/projetos`).
- Verbos: **POST** cria · **GET** consulta/lista · **PATCH** atualiza parcialmente · **PUT** substitui um conjunto por completo (ex.: modelos de contratação, critérios de Score Card) · **DELETE** arquiva (exclusão lógica — RN035) · **POST** em sub-recurso de verbo para ações (`/movimentacoes`, `/vigencia`, `/reabertura`, `/encerramento`).
- Criação → **`201`** com o recurso criado (e `ETag`).
- Erro → envelope **`{ codigo, erro, mensagem, detalhes, requisicao_id }`** (`codigo` = status HTTP; `erro` = identificador estável; `requisicao_id` = correlação com o log).
- **Concorrência otimista:** `GET` retorna `ETag` (versão do recurso). `PATCH`/`PUT` exigem `If-Match` com essa versão → `428` se ausente, `409` se desatualizada.
- **Autorização por persona** (WAD 5.1): cada rota declara as personas permitidas (`estrategista`, `gestor_contas`, `coordenador`, `administrador`). Enforcement entra com a autenticação (RF001); a estrutura de middleware já existe.
- **Correlação:** toda resposta traz `x-request-id`.
- Autor da operação (auditoria) via header `x-usuario-id` até a autenticação (RF001) existir.
- Paginação de listagens: `?pagina=1&por_pagina=20` (offset no MVP).
- Status por rota: ✅ implementado e testado · ⏸ adiado (autenticação real / vínculos de documento).

**Códigos de status usados:** `200` ok · `201` criado · `204` sem conteúdo · `400` requisição malformada · `404` não encontrado · `409` conflito · `422` validação/regra de negócio · `500` erro interno.

---

## Sumário Executivo

> **Estado (15/07/2026):** backend completo e **autenticado** — **51/51 Requisitos Funcionais** implementados e cobertos por testes de integração contra o Supabase real. A autenticação (RF001) usa e-mail + senha (hash scrypt) com JWT próprio, access token curto e refresh token com rotação/revogação; o middleware `autorizar` faz enforcement real por persona (401 sem token, 403 sem permissão); a auditoria registra o autor a partir do token.

| # | Módulo | RFs | Endpoints | Estado |
|---|---|---|---|---|
| 0 | Autenticação & Administração | RF001–RF003 | 12 | ✅ |
| 1 | Partes (Base de Relacionamentos) | RF004–RF009 | 17 | ✅ |
| 2 | Inteligência Estratégica | RF010–RF015 | 37 | ✅ |
| 3 | Clientes & Contratos | RF016–RF018 | 13 | ✅ |
| 4 | Projetos & Oportunidades | RF019–RF026 | 27 | ✅ |
| 5 | Metodologias | RF027–RF033 | 26 | ✅ |
| 6 | Parcerias | RF034–RF037 | 15 | ✅ |
| 7 | Execução | RF038–RF042 | 26 | ✅ |
| 8 | Acompanhamento & Resultados | RF043–RF047 | 18 | ✅ |
| 9 | Governança & IA | RF048–RF051 | 9 | ✅ |
| | **Total** | **RF001–RF051** | **202** | **51/51 RF** |

> Catálogos de vocabulário controlado (status, tipos, papéis, territórios…) são expostos por um conjunto uniforme de rotas `GET /v1/catalogos/<nome>` (item no Módulo 0), evitando dezenas de endpoints repetidos.
>
> A contagem por módulo acima reflete as rotas Express efetivamente registradas (mais granulares que o desenho original de ~153): sub-recursos como versões, vínculos, participantes e movimentações têm rota própria.

---

## Módulo 0 — Administração & Autenticação (RF001–RF003)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF001 | Autenticar (e-mail + senha) | POST | `/v1/auth/login` | RN006 | ✅ |
| RF001 | Renovar sessão (refresh + rotação) | POST | `/v1/auth/refresh` | — | ✅ |
| RF001 | Encerrar sessão (dispositivo) | POST | `/v1/auth/logout` | — | ✅ |
| RF001 | Encerrar todas as sessões | POST | `/v1/auth/logout-todos` | — | ✅ |
| RF001 | Sessão atual | GET | `/v1/auth/sessao` | — | ✅ |
| RF002 | Definir/redefinir senha | PUT | `/v1/usuarios/:id/senha` | RN006 | ✅ |
| RF002 | Criar usuário | POST | `/v1/usuarios` | RN006 | ✅ |
| RF002 | Listar usuários | GET | `/v1/usuarios` | — | ✅ |
| RF002 | Obter usuário | GET | `/v1/usuarios/:id` | — | ✅ |
| RF002 | Atualizar usuário | PATCH | `/v1/usuarios/:id` | RN006 | ✅ |
| RF002 | Inativar usuário | DELETE | `/v1/usuarios/:id` | — | ✅ |
| RF049 | Consultar catálogos | GET | `/v1/catalogos/:nome` | RN018 | ✅ |

**Detalhe**
- `POST /v1/auth/login` — body `{ email: string, senha: string }` → `200 { token, usuario }` · `401` credenciais inválidas. *(implementação adiada — RF001)*
- `POST /v1/usuarios` — body `{ nome: string, email: string, cargo?: string }` → `201` usuário · `422` e-mail inválido · `409` e-mail duplicado (case-insensitive, RN006).
- `PATCH /v1/usuarios/:id` — body parcial `{ nome?, cargo?, ativo? }` → `200`.
- `DELETE /v1/usuarios/:id` — inativa (não remove) → `204`.
- `GET /v1/catalogos/:nome` — `:nome` ∈ {`status-parte`,`papeis`,`tipos-organizacao`,`status-cliente`,`status-projeto`,`status-candidatura`,`tipos-validacao`,`tipos-decisao`,`status-parceria`,`territorios`,`tipos-metrica`,…} → `200 [{ codigo, nome, ordem }]`.

> **RF003 (trilha de auditoria)** não tem endpoint de escrita: é gravada automaticamente por triggers em cada operação (RN037). A *consulta* da trilha é RF049 (Módulo 9).

---

## Módulo 1 — Partes / Base de Relacionamentos (RF004–RF009)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF004 | Criar Parte + especialização | POST | `/v1/partes` | RN001, RN002 | ✅ |
| RF004/RF008 | Listar/buscar Partes | GET | `/v1/partes` | — | ✅ |
| RF004 | Obter Parte | GET | `/v1/partes/:id` | — | ✅ |
| RF004/RF005 | Atualizar Parte (campos base; especialização pendente) | PATCH | `/v1/partes/:id` | RN001, RN002 | ✅ |
| RF004 | Arquivar Parte | DELETE | `/v1/partes/:id` | RN035 | ✅ |
| RF006 | Adicionar papel | POST | `/v1/partes/:id/papeis` | RN005, RN030 | ✅ |
| RF006 | Listar papéis | GET | `/v1/partes/:id/papeis` | — | ✅ |
| RF006 | Remover papel | DELETE | `/v1/partes/:id/papeis/:papelId` | RN005 | ✅ |
| RF007 | Adicionar contato | POST | `/v1/partes/:id/contatos` | RN004 | ✅ |
| RF007 | Listar contatos | GET | `/v1/partes/:id/contatos` | — | ✅ |
| RF007 | Atualizar contato | PATCH | `/v1/partes/:id/contatos/:contatoId` | RN004 | ✅ |
| RF007 | Remover contato | DELETE | `/v1/partes/:id/contatos/:contatoId` | — | ✅ |
| RF009 | Criar documento | POST | `/v1/documentos` | RN035 | ✅ |
| RF009 | Obter documento | GET | `/v1/documentos/:id` | — | ✅ |
| RF009 | Vincular documento | POST | `/v1/documentos/:id/vinculos` | — | ⏸ ¹ |
| RF009 | Desvincular documento | DELETE | `/v1/documentos/:id/vinculos/:entidade/:entidadeId` | — | ⏸ ¹ |

> ¹ Os **vínculos** de documento só fazem sentido quando as entidades-alvo tiverem API (projeto, briefing, Paper, contrato, parceria, plano). Serão implementados junto com esses módulos. Como as tabelas associativas têm chave composta (sem id próprio), a remoção usa `:entidade/:entidadeId` em vez de um `vinculoId`.

**Detalhe**
- `POST /v1/partes` ✅ — body discriminado por `tipo`:
  `{ tipo:"organizacao", nome_exibicao:string, status_parte_codigo?:string, organizacao:{ nome_fantasia:string, razao_social?:string, cnpj?:string(14), segmento_principal?:string, site?:string } }`
  ou `{ tipo:"pessoa", nome_exibicao:string, pessoa:{ nome_completo:string, nome_artistico?:string, cpf?:string(11), nacionalidade?:string } }`.
  → `201 { id, tipo, nome_exibicao, status, criado_em, especializacao:{…} }` · `422` CPF/CNPJ inválido ou nome vazio · `409` CPF/CNPJ duplicado.
- `GET /v1/partes?busca=&tipo=&pagina=&por_pagina=` ✅ — busca trigram (RF008) → `200 { itens:[…], pagina, total }`.
- `PATCH /v1/partes/:id` ✅ — body parcial (campos base + `especializacao` parcial) → `200`.
- `DELETE /v1/partes/:id` ✅ — arquivamento lógico (`arquivado_em`) → `204`.
- `POST /v1/partes/:id/papeis` ✅ — `{ papel_codigo:string, vigente_desde?:date, vigente_ate?:date }` → `201` · `409` papel já ativo (RN005).
- `POST /v1/partes/:id/contatos` ✅ — `{ nome:string, cargo?:string, email?:string, telefone?:string, principal?:boolean }` → `201` · `409` já há principal ativo (RN004).
- `POST /v1/documentos` ✅ — `{ nome:string, tipo_mime:string, arquivo_url:string, hash_sha256:string(64), tamanho_bytes?:number }` → `201`.
- `POST /v1/documentos/:id/vinculos` ✅ — `{ entidade:"projeto"|"paper"|"contrato"|"parceria"|"briefing"|"planejamento"|"plano_execucao", entidade_id:uuid }` → `201`.

---

## Módulo 2 — Inteligência Estratégica (RF010–RF015)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF010 | Criar versão de perfil | POST | `/v1/partes/:id/perfis-estrategicos` | RN021, RN036 | ✅ |
| RF010 | Listar versões de perfil | GET | `/v1/partes/:id/perfis-estrategicos` | — | ✅ |
| RF010 | Obter versão de perfil | GET | `/v1/perfis-estrategicos/:id` | — | ✅ |
| RF010 | Publicar versão vigente | POST | `/v1/perfis-estrategicos/:id/vigencia` | RN021 | ✅ |
| RF011 | Associar público | POST | `/v1/partes/:id/publicos` | RN035 | ✅ |
| RF011 | Remover público | DELETE | `/v1/partes/:id/publicos/:vinculoId` | — | ✅ |
| RF011 | Associar praça | POST | `/v1/partes/:id/pracas` | RN035 | ✅ |
| RF011 | Remover praça | DELETE | `/v1/partes/:id/pracas/:vinculoId` | — | ✅ |
| RF011 | Associar território | POST | `/v1/partes/:id/territorios` | RN035 | ✅ |
| RF011 | Remover território | DELETE | `/v1/partes/:id/territorios/:vinculoId` | — | ✅ |
| RF012 | Criar ativo | POST | `/v1/partes/:id/ativos` | RN038 | ✅ |
| RF012 | Listar ativos | GET | `/v1/partes/:id/ativos` | — | ✅ |
| RF012 | Atualizar/arquivar ativo | PATCH/DELETE | `/v1/ativos/:id` | RN038, RN035 | ✅ |
| RF013 | Criar canal de mídia | POST | `/v1/partes/:id/canais-midia` | — | ✅ |
| RF013 | Registrar medição de mídia | POST | `/v1/canais-midia/:id/medicoes` | RN036 | ✅ |
| RF013 | Listar medições | GET | `/v1/canais-midia/:id/medicoes` | — | ✅ |
| RF014 | Criar disponibilidade | POST | `/v1/disponibilidades` | RN029, RN030 | ✅ |
| RF014 | Listar disponibilidades | GET | `/v1/disponibilidades` | — | ✅ |
| RF015 | Registrar representação | POST | `/v1/pessoas/:id/representacoes` | RN030 | ✅ |
| RF015 | Criar turnê + eventos | POST | `/v1/pessoas/:id/turnes` | RN030 | ✅ |
| RF015 | Criar Big Moment | POST | `/v1/pessoas/:id/big-moments` | RN036 | ✅ |
| RF015 | Criar evento de agenda | POST | `/v1/pessoas/:id/agenda` | RN030 | ✅ |

**Detalhe (destaques)**
- `POST /v1/partes/:id/perfis-estrategicos` — `{ resumo?, posicionamento?, objetivos?, desafios? }` (nova versão) → `201`; `POST …/:id/vigencia` marca vigente (garante 1 vigente — RN021).
- `POST /v1/disponibilidades` — `{ parte_id?:uuid, ativo_id?:uuid, tipo_disponibilidade_codigo:string, data_inicio:datetime, data_fim:datetime, motivo_indisponibilidade? }` → `201` · `422` se informar parte **e** ativo, ou nenhum (RN029), ou `data_fim < data_inicio` (RN030).
- `POST /v1/canais-midia/:id/medicoes` — `{ tipo_metrica_codigo:string, valor:number, unidade?:string, fonte?:string, nivel_confianca?:number(0–1) }` → `201`.
- `POST /v1/pessoas/:id/turnes` — `{ nome:string, descricao?, data_inicio?, data_fim?, eventos?:[{ nome?, cidade?, local?, data_evento:date }] }` → `201`.

---

## Módulo 3 — Clientes & Contratos (RF016–RF018)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF016 | Registrar cliente | POST | `/v1/clientes` | RN007 | ✅ |
| RF016 | Listar clientes | GET | `/v1/clientes` | — | ✅ |
| RF016 | Obter cliente | GET | `/v1/clientes/:id` | — | ✅ |
| RF016 | Atualizar cliente | PATCH | `/v1/clientes/:id` | — | ✅ |
| RF016 | Encerrar vínculo | DELETE | `/v1/clientes/:id` | RN035 | ✅ |
| RF017 | Criar contrato | POST | `/v1/clientes/:id/contratos` | RN008, RN011, RN030 | ✅ |
| RF017 | Listar contratos | GET | `/v1/clientes/:id/contratos` | — | ✅ |
| RF017 | Obter contrato | GET | `/v1/contratos/:id` | RN011 | ✅ |
| RF017 | Atualizar contrato | PATCH | `/v1/contratos/:id` | RN011 | ✅ |
| RF018 | Definir modelos de contratação | PUT | `/v1/contratos/:id/modelos` | RN009 | ✅ |
| RF018 | Adicionar componente de remuneração | POST | `/v1/contratos/:id/componentes-remuneracao` | RN010, RN038 | ✅ |
| RF018 | Listar componentes | GET | `/v1/contratos/:id/componentes-remuneracao` | — | ✅ |
| RF018 | Remover componente | DELETE | `/v1/contratos/:id/componentes-remuneracao/:compId` | — | ✅ |

**Detalhe**
- `POST /v1/clientes` — `{ parte_id:uuid, responsavel_conta_id?:uuid, status_cliente_codigo?:string, inicio_relacionamento?:date }` → `201` · `409` a Parte já tem vínculo ativo (RN007).
- `POST /v1/clientes/:id/contratos` — `{ codigo?:string, descricao?, data_inicio?, data_fim?, status_contrato_codigo?:string }` → `201` · `409` código de contrato ativo duplicado (RN011).
- `PUT /v1/contratos/:id/modelos` — `{ modelos:[codigo] }` (substitui o conjunto N:N — RN009) → `200`.
- `POST …/componentes-remuneracao` — `{ tipo_remuneracao_codigo:string, valor?:number, moeda?:CHAR(3), percentual?:number, vigente_desde?, vigente_ate? }` → `201` · `422` sem valor e sem percentual, ou valor sem moeda (RN010).

---

## Módulo 4 — Projetos & Oportunidades (RF019–RF026)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF019 | Criar projeto | POST | `/v1/projetos` | RN012, RN030 | ✅ |
| RF019 | Listar projetos | GET | `/v1/projetos` | — | ✅ |
| RF019 | Obter projeto | GET | `/v1/projetos/:id` | — | ✅ |
| RF019 | Atualizar projeto | PATCH | `/v1/projetos/:id` | RN030 | ✅ |
| RF019 | Arquivar projeto | DELETE | `/v1/projetos/:id` | RN035 | ✅ |
| RF020 | Registrar origem da demanda | POST | `/v1/projetos/:id/origens-demanda` | RN018 | ✅ |
| RF021 | Criar versão de briefing | POST | `/v1/projetos/:id/briefings` | RN021 | ✅ |
| RF021 | Publicar briefing vigente | POST | `/v1/briefings/:id/vigencia` | RN021 | ✅ |
| RF022 | Criar versão de planejamento | POST | `/v1/projetos/:id/planejamentos` | RN021 | ✅ |
| RF022 | Publicar planejamento vigente | POST | `/v1/planejamentos/:id/vigencia` | RN021 | ✅ |
| RF023 | Adicionar responsável | POST | `/v1/projetos/:id/responsaveis` | RN013, RN031 | ✅ |
| RF023 | Remover responsável | DELETE | `/v1/projetos/:id/responsaveis/:respId` | RN013 | ✅ |
| RF024 | Criar frente | POST | `/v1/projetos/:id/frentes` | RN014, RN030 | ✅ |
| RF024 | Listar frentes do projeto | GET | `/v1/projetos/:id/frentes` | — | ✅ |
| RF024 | Obter/atualizar frente | GET/PATCH | `/v1/frentes/:id` | RN014 | ✅ |
| RF024 | Reabrir frente | POST | `/v1/frentes/:id/reabertura` | RN014 | ✅ |
| RF025 | Registrar candidatura | POST | `/v1/frentes/:id/candidaturas` | RN015, RN016, RN018 | ✅ |
| RF025 | Listar candidaturas da frente | GET | `/v1/frentes/:id/candidaturas` | — | ✅ |
| RF025 | Obter candidatura | GET | `/v1/candidaturas/:id` | — | ✅ |
| RF026 | Movimentar status (com histórico) | POST | `/v1/candidaturas/:id/movimentacoes` | RN017 | ✅ |
| RF026 | Consultar histórico | GET | `/v1/candidaturas/:id/movimentacoes` | RN017 | ✅ |
| RF025 | Arquivar candidatura | DELETE | `/v1/candidaturas/:id` | RN035 | ✅ |

**Detalhe**
- `POST /v1/projetos` — `{ cliente_cross_id:uuid, contrato_cliente_id?:uuid, nome:string, objetivo:string, produto?, data_inicio?, data_previsao_fim?, status_projeto_codigo?, prioridade_codigo? }` → `201` · `422` sem cliente/objetivo (RN012) · `422` datas inconsistentes (RN030).
- `POST /v1/projetos/:id/frentes` — `{ nome:string, objetivo:string, territorio_id?:uuid, categoria?, data_abertura:date, status_frente_codigo? }` → `201`.
- `POST /v1/frentes/:id/candidaturas` — `{ parte_id:uuid, interesse_cliente_codigo?, interesse_parceiro_codigo?, prioridade_codigo?, status_candidatura_codigo? }` → `201` · `409` a Parte já tem candidatura ativa nessa frente (RN015).
- `POST /v1/candidaturas/:id/movimentacoes` — `{ status_codigo:string, justificativa?, contexto?:json }` → `201` (atualiza estado **e** grava histórico na mesma transação — RN017).
- `DELETE /v1/projetos/:id/responsaveis/:respId` — recusa remover o **último** responsável ativo (RN013) → `409`.

---

## Módulo 5 — Metodologias (RF027–RF033)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF027 | Criar análise Crossability | POST | `/v1/candidaturas/:id/analises-crossability` | RN019, RN036 | ✅ |
| RF027 | Listar análises | GET | `/v1/candidaturas/:id/analises-crossability` | — | ✅ |
| RF028 | Criar Paper | POST | `/v1/frentes/:id/papers` | — | ✅ |
| RF028 | Criar versão de Paper | POST | `/v1/papers/:id/versoes` | RN021 | ✅ |
| RF028 | Publicar versão vigente | POST | `/v1/versoes-paper/:id/vigencia` | RN021 | ✅ |
| RF028 | Obter Paper (com versões) | GET | `/v1/papers/:id` | — | ✅ |
| RF029 | Recomendar candidatura no Paper | POST | `/v1/papers/:id/recomendacoes` | — | ✅ |
| RF029 | Remover recomendação | DELETE | `/v1/papers/:id/recomendacoes/:candId` | — | ✅ |
| RF030 | Registrar validação | POST | `/v1/versoes-paper/:id/validacoes` | RN020 | ✅ |
| RF030 | Listar validações | GET | `/v1/versoes-paper/:id/validacoes` | — | ✅ |
| RF031 | Criar modelo de Score Card | POST | `/v1/modelos-score-card` | — | ✅ |
| RF031 | Criar versão do modelo | POST | `/v1/modelos-score-card/:id/versoes` | RN021 | ✅ |
| RF031 | Definir critérios | PUT | `/v1/versoes-modelo-score-card/:id/criterios` | RN023 | ✅ |
| RF031 | Obter modelo/versão | GET | `/v1/modelos-score-card/:id` | — | ✅ |
| RF032 | Aplicar avaliação Score Card | POST | `/v1/candidaturas/:id/avaliacoes-score-card` | RN022, RN023, RN024, RN039 | ✅ |
| RF032 | Obter avaliação | GET | `/v1/avaliacoes-score-card/:id` | — | ✅ |
| RF033 | Registrar decisão | POST | `/v1/candidaturas/:id/decisoes` | RN025 | ✅ |
| RF033 | Listar decisões | GET | `/v1/candidaturas/:id/decisoes` | — | ✅ |
| RF027 | Obter análise | GET | `/v1/analises-crossability/:id` | — | ✅ |

**Detalhe**
- `POST /v1/candidaturas/:id/analises-crossability` — `{ compatibilidade_publicos?, compatibilidade_territorios?, complementaridade_ativos?, sinergias?, fit_estrategico?, momento_estrategico?, racional_recomendacao?, status_crossability_codigo? }` → `201` (nova versão; nunca sobrescreve — RN019).
- `POST /v1/versoes-paper/:id/validacoes` — `{ tipo_validacao_codigo:string, status_validacao_codigo:string, observacoes? }` → `201` (sempre sobre uma versão específica — RN020).
- `PUT /v1/versoes-modelo-score-card/:id/criterios` — `{ criterios:[{ nome, peso_sim, peso_nao, ordem, obrigatorio? }] }` → `200` (pesos ≥ 0, ordem única).
- `POST /v1/candidaturas/:id/avaliacoes-score-card` — `{ versao_modelo_score_card_id:uuid, validacao_paper_id:uuid, potencial_disruptivo:1–5, respostas:[{ criterio_id:uuid, valor:"sim"|"nao"|"nao_avaliado" }] }`. A engine calcula `pontuacao_obtida` e `score_total`; o banco valida (RN023). → `201` · `422` se a validação não estiver aprovada (RN022), resposta duplicada por critério (RN024) ou potencial fora de 1–5.

---

## Módulo 6 — Parcerias (RF034–RF037)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF034 | Criar parceria | POST | `/v1/parcerias` | RN026, RN027, RN028 | ✅ |
| RF034 | Listar parcerias | GET | `/v1/parcerias` | — | ✅ |
| RF034 | Obter parceria | GET | `/v1/parcerias/:id` | — | ✅ |
| RF034 | Atualizar/arquivar parceria | PATCH/DELETE | `/v1/parcerias/:id` | RN035 | ✅ |
| RF035 | Registrar negociação | POST | `/v1/parcerias/:id/negociacoes` | RN030 | ✅ |
| RF035 | Atualizar negociação | PATCH | `/v1/negociacoes/:id` | RN030 | ✅ |
| RF036 | Registrar contrapartida | POST | `/v1/parcerias/:id/contrapartidas` | RN038 | ✅ |
| RF036 | Marcar contrapartida cumprida | PATCH | `/v1/contrapartidas/:id` | — | ✅ |
| RF036 | Listar contrapartidas | GET | `/v1/parcerias/:id/contrapartidas` | — | ✅ |
| RF037 | Registrar contrato de parceria | POST | `/v1/parcerias/:id/contratos` | RN030, RN038 | ✅ |
| RF037 | Obter/atualizar contrato | GET/PATCH | `/v1/contratos-parceria/:id` | RN030 | ✅ |
| RF035 | Listar negociações | GET | `/v1/parcerias/:id/negociacoes` | — | ✅ |

**Detalhe**
- `POST /v1/parcerias` — `{ candidatura_parceiro_id:uuid, tipo_parceria_codigo?, data_inicio?, condicoes_comerciais? }` → `201` · `422` se não houver decisão aprovada + Paper validado (RN026) · `409` se a candidatura já tem parceria ativa (RN027). Um novo ciclo após encerramento gera nova parceria preservando histórico (RN028).

---

## Módulo 7 — Execução (RF038–RF042)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF038 | Criar plano de execução | POST | `/v1/parcerias/:id/planos-execucao` | RN021, RN030 | ✅ |
| RF038 | Publicar plano vigente | POST | `/v1/planos-execucao/:id/vigencia` | RN021 | ✅ |
| RF038 | Criar etapa | POST | `/v1/planos-execucao/:id/etapas` | RN030 | ✅ |
| RF038 | Criar entrega | POST | `/v1/etapas/:id/entregas` | — | ✅ |
| RF038 | Atualizar entrega | PATCH | `/v1/entregas/:id` | — | ✅ |
| RF039 | Designar responsável por entrega | POST | `/v1/entregas/:id/responsaveis` | RN031 | ✅ |
| RF039 | Remover responsável de entrega | DELETE | `/v1/entregas/:id/responsaveis/:respId` | — | ✅ |
| RF040 | Registrar reunião | POST | `/v1/parcerias/:id/reunioes` | — | ✅ |
| RF040 | Adicionar participante | POST | `/v1/reunioes/:id/participantes` | RN031 | ✅ |
| RF040 | Listar reuniões | GET | `/v1/parcerias/:id/reunioes` | — | ✅ |
| RF041 | Registrar touchpoint | POST | `/v1/parcerias/:id/touchpoints` | — | ✅ |
| RF041 | Listar touchpoints | GET | `/v1/parcerias/:id/touchpoints` | — | ✅ |
| RF042 | Criar pendência | POST | `/v1/parcerias/:id/pendencias` | RN032 | ✅ |
| RF042 | Atualizar pendência | PATCH | `/v1/pendencias/:id` | RN032 | ✅ |
| RF042 | Listar pendências | GET | `/v1/parcerias/:id/pendencias` | — | ✅ |
| RF038 | Listar planos/etapas/entregas | GET | `/v1/parcerias/:id/planos-execucao` | — | ✅ |

**Detalhe**
- `POST /v1/entregas/:id/responsaveis` — `{ usuario_interno_id?:uuid, parte_id?:uuid, funcao?, inicio?, fim? }` → `201` · `422` se informar interno **e** externo, ou nenhum (RN031).
- `POST /v1/parcerias/:id/pendencias` — `{ descricao:string, etapa_execucao_id?:uuid, entrega_id?:uuid, status_pendencia_codigo?, prazo? }` → `201` (sempre ligada à parceria; etapa/entrega opcionais — RN032).

---

## Módulo 8 — Acompanhamento & Resultados (RF043–RF047)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF043 | Registrar acompanhamento | POST | `/v1/parcerias/:id/acompanhamentos` | — | ✅ |
| RF043 | Listar acompanhamentos | GET | `/v1/parcerias/:id/acompanhamentos` | — | ✅ |
| RF044 | Vincular indicador à parceria | POST | `/v1/parcerias/:id/indicadores` | — | ✅ |
| RF044 | Registrar medição | POST | `/v1/parcerias/:id/medicoes` | RN030, RN036 | ✅ |
| RF044 | Listar medições | GET | `/v1/parcerias/:id/medicoes` | — | ✅ |
| RF044 | Gerenciar catálogo de indicadores | POST/GET | `/v1/indicadores` | — | ✅ |
| RF045 | Registrar resultado | POST | `/v1/parcerias/:id/resultados` | RN036, RN038 | ✅ |
| RF045 | Listar resultados | GET | `/v1/parcerias/:id/resultados` | — | ✅ |
| RF046 | Registrar cálculo de ROI | POST | `/v1/parcerias/:id/calculos-roi` | RN033, RN039 | ✅ |
| RF046 | Listar cálculos de ROI | GET | `/v1/parcerias/:id/calculos-roi` | RN033 | ✅ |
| RF047 | Encerrar projeto | POST | `/v1/projetos/:id/encerramento` | RN034 | ✅ |
| RF047 | Encerrar parceria | POST | `/v1/parcerias/:id/encerramento` | RN034 | ✅ |
| RF047 | Obter encerramento do projeto | GET | `/v1/projetos/:id/encerramento` | — | ✅ |
| RF047 | Obter encerramento da parceria | GET | `/v1/parcerias/:id/encerramento` | — | ✅ |

**Detalhe**
- `POST /v1/parcerias/:id/medicoes` — `{ indicador_id:uuid, periodo_inicio:date, periodo_fim:date, valor:number, unidade?, fonte?, nivel_confianca? }` → `201` · `422` período inconsistente (RN030).
- `POST /v1/parcerias/:id/calculos-roi` — `{ investimento_estimado?, investimento_realizado?, retorno_estimado?, retorno_realizado?, moeda:CHAR(3), premissas?, nivel_confianca? }` → `201`; cada cálculo é histórico e independente (RN033).
- `POST /v1/projetos/:id/encerramento` — `{ motivo:string, resultados_gerais?, aprendizados?, proximos_passos? }` → `201` · `409` já encerrado (RN034).

---

## Módulo 9 — Governança & IA (RF048–RF051)

| RF | Descrição | Método | Caminho | RNs | Status |
|---|---|---|---|---|---|
| RF048 | Criar fonte | POST | `/v1/fontes` | — | ✅ |
| RF048 | Criar evidência | POST | `/v1/evidencias` | RN036 | ✅ |
| RF048 | Obter evidência | GET | `/v1/evidencias/:id` | — | ✅ |
| RF048 | Vincular evidência a registro | POST | `/v1/evidencias/:id/vinculos` | — | ✅ |
| RF048 | Desvincular evidência | DELETE | `/v1/evidencias/:id/vinculos/:vinculoId` | — | ✅ |
| RF049 | Consultar auditoria | GET | `/v1/auditoria` | RN037 | ✅ |
| RF049 | Auditoria de um registro | GET | `/v1/auditoria?entidade=&registro_id=` | RN037 | ✅ |
| RF050 | Iniciar importação de planilha | POST | `/v1/importacoes` | RN018, RN038 | ✅ |
| RF050 | Status/relatório da importação | GET | `/v1/importacoes/:id` | — | ✅ |
| RF051 | Consulta assistida por IA | POST | `/v1/ia/consultas` | RN036, RN037 | ⏸ |
| RF051 | Recomendações por IA | GET | `/v1/ia/recomendacoes` | — | ⏸ |

**Detalhe**
- `POST /v1/evidencias/:id/vinculos` — `{ entidade:"perfil_estrategico"|"analise_crossability"|"medicao_midia"|"big_moment"|"resultado"|"calculo_roi", entidade_id:uuid, relevancia? }` → `201` (vínculo com FK explícita — sem polimorfismo).
- `GET /v1/auditoria?entidade=projeto&registro_id=…&de=&ate=&pagina=` → `200 { itens:[{ operacao, usuario_id, dados_anteriores, dados_novos, executado_em }], … }` (somente leitura — RN037).
- `POST /v1/importacoes` — `multipart/form-data` `{ tipo:"partes"|"projetos"|…, arquivo }` → `202 { id }`; `GET /v1/importacoes/:id` → linhas aceitas/rejeitadas com motivo.

---

## Verificação cruzada — cobertura RF001–RF051

| RF | Coberto por | RF | Coberto por |
|---|---|---|---|
| RF001 | `/v1/auth/*` (⏸) | RF027 | `…/analises-crossability` |
| RF002 | `/v1/usuarios` | RF028 | `…/papers`, `…/versoes` |
| **RF003** | **sem endpoint — trilha automática por trigger (RN037); consulta = RF049** | RF029 | `…/recomendacoes` |
| RF004 | `/v1/partes` ✅ | RF030 | `…/validacoes` |
| **RF005** | **embutido em POST/PATCH `/v1/partes` (especialização no mesmo recurso)** | RF031 | `…/modelos-score-card` |
| RF006 | `…/papeis` | RF032 | `…/avaliacoes-score-card` |
| RF007 | `…/contatos` | RF033 | `…/decisoes` |
| RF008 | `GET /v1/partes?busca=` | RF034 | `/v1/parcerias` |
| RF009 | `/v1/documentos` | RF035 | `…/negociacoes` |
| RF010 | `…/perfis-estrategicos` | RF036 | `…/contrapartidas` |
| RF011 | `…/publicos|pracas|territorios` | RF037 | `…/contratos` (parceria) |
| RF012 | `…/ativos` | RF038 | `…/planos-execucao` |
| RF013 | `…/canais-midia`, `…/medicoes` | RF039 | `…/entregas/:id/responsaveis` |
| RF014 | `/v1/disponibilidades` | RF040 | `…/reunioes` |
| RF015 | `/v1/pessoas/:id/*` | RF041 | `…/touchpoints` |
| RF016 | `/v1/clientes` | RF042 | `…/pendencias` |
| RF017 | `…/contratos` | RF043 | `…/acompanhamentos` |
| RF018 | `…/modelos`, `…/componentes-remuneracao` | RF044 | `…/indicadores`, `…/medicoes` |
| RF019 | `/v1/projetos` | RF045 | `…/resultados` |
| RF020 | `…/origens-demanda` | RF046 | `…/calculos-roi` |
| RF021 | `…/briefings` | RF047 | `…/encerramento` |
| RF022 | `…/planejamentos` | RF048 | `/v1/fontes`, `/v1/evidencias` |
| RF023 | `…/responsaveis` | RF049 | `/v1/auditoria` |
| RF024 | `…/frentes` | RF050 | `/v1/importacoes` |
| RF025 | `…/candidaturas` | RF051 | `/v1/ia/*` (⏸) |
| RF026 | `…/movimentacoes` | | |

**Resultado da verificação:** os 51 RFs estão cobertos. Dois **não possuem endpoint próprio**, com justificativa:
- **RF003** — a trilha de auditoria é gerada automaticamente por triggers (RN037); não há escrita via API. A leitura é atendida por RF049 (`GET /v1/auditoria`).
- **RF005** — a especialização (organização/pessoa) é parte inseparável do recurso Parte; é criada/atualizada dentro de `POST`/`PATCH /v1/partes`, não como recurso à parte.

Nenhum RF que exige interação via API ficou sem rota. Cobertura: **100%**.
