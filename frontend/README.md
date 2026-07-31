# Plataforma Cross — Frontend

Frontend da Plataforma Cross (Crossnetworking): curadoria, score e gestão de parcerias
estratégicas. A interface consome a API local e o PostgreSQL da plataforma, com fluxos de
importação, edição, oportunidades e agentes de IA. Identidade visual: marca CROSS NETWORKING (símbolo geodésico +
wordmark), base **preto e branco** com **dourado champagne `#B98E4A`** como único acento
(links, medidores, destaques; hover/texto `#8A6832`), fundo `#F7F5F1`, tipografia
Archivo · Hanken Grotesk · Space Mono.

**Fluxo que o front reflete (README/WAD):** uma empresa chega à Cross buscando parceria
(o **cliente**); a Cross abre um **projeto** que percorre o ciclo *briefing → planejamento
→ Crossability → Paper → Score Card → implementação → acompanhamento*, buscando **marcas
parceiras** na base de relacionamentos. Clientes e parceiros são Partes distintas da mesma
base — a plataforma diferencia quem busca a parceria de quem entra nela.

## Stack

- **React 18 + TypeScript** (strict) + **Vite 5**
- **Tailwind CSS 3** com tokens do design system
- **Zustand** (estado global com persistência em `localStorage`)
- **React Router 7** (HashRouter — funciona em qualquer host estático)
- **lucide-react** (ícones lineares 1.5px, conforme o design system)
- **@fontsource** (fontes empacotadas localmente — nada vem de CDN)

## Como rodar

O ambiente usa o Node portátil (não está no PATH):

```powershell
$env:PATH = "C:\Users\IgorRodrigues-CrossN\AppData\Local\node-portable\node-v24.18.0-win-x64;$env:PATH"
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve o build
```

Login: use uma conta cadastrada no backend. A sessão é autenticada pela API local.

## Módulos

| Rota | Módulo | O que demonstra |
|---|---|---|
| `/login` | Autenticação | Split-screen com a marca e sessão autenticada pela API |
| `/` | Dashboard | Visão global: saudação, KPIs (projetos em andamento, em negociação, parcerias ativas, valor potencial do pipeline), **funil de projetos por fase do ciclo**, projetos e atividades recentes |
| `/oportunidades` | **Oportunidades de parceria · IA** | Radar de sugestões com fit Crossability, confiança, fontes consideradas, racional e briefing inicial; toda saída permanece sujeita ao Human Gate |
| `/partes` | **Base de relacionamentos** | Todas as Partes do ecossistema (organizações e pessoas — RF004/RF005), com visões separadas: **clientes (quem busca a Cross)** × **marcas & organizações (parceiros)** × pessoas & talentos |
| `/partes/:id` | Detalhe da Parte | Perfil estratégico, praças, ativos, canais de mídia, contatos (RF006–RF013) e **histórico transversal**: candidaturas e parcerias em todos os clientes |
| `/projetos` | **Base global de projetos** | Todos os projetos de todos os clientes (a memória da operação): tabela com cliente, **fase atual do ciclo**, status, valor potencial, responsáveis e abas de filtro |
| `/projetos/:id` | Detalhe do projeto | **Stepper do ciclo** (briefing → … → acompanhamento), painel de resumo (produto, territórios, prazo, valor potencial, equipe), **todos os briefings versionados** (RF021), planejamento estratégico (RF022), frentes (RF024) com candidaturas e **Papers com validações** (RF028–RF030) |
| `/criterios` | Critérios & pesos | Modelo de Score Card por cliente (RF031); editar peso recalcula tudo ao vivo |
| `/marcas` | Base de marcas | Busca tolerante a acentos (RF008), filtros, cards com score |
| `/marcas/:id` | **Crossability + Score Card** | Aba Crossability (RF027): 6 dimensões, racional e versões imutáveis (RN019); aba Score Card: SIM/NÃO/N.A., potencial disruptivo, score determinístico (RN023), alerta de Paper não validado (RN022) e histórico da candidatura (RN017) |
| `/ranking` | Ranking | Priorização por score com filtros (categoria, status, score mínimo) |
| `/funil` | Funil comercial | Kanban com drag-and-drop; cada movimentação grava histórico (RF026) |
| `/cronograma` | Cronograma 2026 | Timeline das parcerias fechadas com fases e linha "hoje" |
| `/parcerias/:id` | **Execução & acompanhamento** | Plano de execução, entregas, reuniões, pendências (RF038–RF042), indicadores com medições e cálculos de ROI históricos (RF043–RF046, RN033) |
| `/resumo` | Resumo executivo | Folha A4 para o cliente com exportação em **PDF** (imprimir) |

## Conceitos de domínio (alinhados ao WAD)

- **Cliente Cross** → seletor no topo; cada cliente tem seu próprio modelo de critérios/pesos.
- **Candidatura** → marca sendo avaliada para um cliente, com status de vocabulário controlado
  (`identificada … encerrada`) e histórico de movimentações.
- **Score determinístico (RN023):** `SIM → peso_sim · NÃO → peso_nao · N.A. → 0`;
  `score_total = Σ pontuações + potencial disruptivo (1–5)` — nunca editável à mão
  (`src/lib/score.ts` é a única fonte de cálculo).
- A data "hoje" da demo é fixada em **15/07/2026** (`src/lib/format.ts`) para que funil e
  cronograma façam sentido em qualquer data de apresentação.

## Estrutura

```
src/
├── components/     # ui.tsx (primitivos), AppShell (sidebar/topbar), Logo
├── api/            # cliente HTTP, contratos e mapeadores da API
├── lib/            # score.ts (engine RN023), format.ts, useDadosCliente.ts
├── pages/          # Login, Dashboard, Criterios, Marcas, ScoreCard, Ranking, Funil, Cronograma, Resumo
├── store/          # Zustand + persistência (chave plataforma-cross-demo)
├── App.tsx         # rotas + guarda de autenticação
└── main.tsx        # fontes + bootstrap
```

Os dados de negócio são persistidos pela API; ações de criação, edição, importação e
curadoria de oportunidades permanecem auditáveis no backend.

## Integração com o backend

O frontend utiliza a API da plataforma para autenticação, clientes, partes, projetos,
frentes, candidaturas, Score Card, importação e oportunidades de IA. O contrato HTTP
mantém o vocabulário de domínio, histórico de movimentações e envelopes de erro.
