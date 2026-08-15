# 04 — Arquitetura de Informação do Dashboard e Navegação

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Arquitetura de informação, não redesign visual. Nada implementado.

---

## 1. A pergunta que o dashboard responde

**Hoje:** "quantos registros existem?" — `Dashboard.tsx` (307 linhas) é um
resumo de cadastros.

**Alvo:** **"o que precisa da minha atenção?"**

A diferença é de ordenação: em vez de agrupar por entidade, agrupa por
**urgência de decisão humana**.

---

## 2. Blocos propostos

Ordem = prioridade de atenção. Cada bloco declara sua origem de dado.

### Faixa 1 — Aguardando você

| Bloco | Origem do dado | Entidade | API atual | Precisa evoluir? |
|---|---|---|---|---|
| **Human Gates pendentes** | `oportunidade_ia.status IN ('rascunho','em_curadoria')` | Oportunidade IA | `GET /agentes/oportunidades` | Não — só filtro |
| **Análises em andamento** | `tarefa_pipeline.status='executando'` + `progresso` | Agent Run | `GET /agentes/tarefas` | Não |
| **Oportunidades travadas** | `candidatura_parceiro` + `historico_candidatura` sem movimento há N dias | Oportunidade | — | **Sim** — endpoint novo |

> "Travadas" é o bloco de maior valor operacional e o único que exige backend
> novo: precisa de uma consulta que cruze status atual com a data da última
> movimentação.

### Faixa 2 — Oportunidades

| Bloco | Origem do dado | Entidade | API atual | Precisa evoluir? |
|---|---|---|---|---|
| **Novas oportunidades** | `oportunidade_ia` por `criado_em` | Oportunidade IA | `GET /agentes/oportunidades` | Não |
| **Em destaque** | `score_fit` × `confianca` | Oportunidade IA | idem | Não — ordenação |
| **Funil** | contagem por `status_candidatura` | Oportunidade | `GET /frentes/:id/candidaturas` | **Sim** — agregação por cliente |
| **Recomendações recentes** | `execucao_agente` (agente=`recommendation`) | Agent Run | `GET /agentes/execucoes` | Não |

### Faixa 3 — Inteligência nova

| Bloco | Origem do dado | Entidade | API atual | Precisa evoluir? |
|---|---|---|---|---|
| **Fatos novos** | `execucao_agente` (agente=`information_extractor`) + verificação | Evidence | `GET /agentes/execucoes` | **Sim** — leitura estruturada |
| **Reuniões que agregaram** | `reuniao` + Meeting Intelligence | Reunião | — | **Sim** — depende da migration 055 |
| **Big Moments** | `cross_intelligence` + artistas | Big Moment | parcial | **Sim** — sem estrutura própria |

### Faixa 4 — Saúde da inteligência

| Bloco | Origem do dado | Entidade | API atual | Precisa evoluir? |
|---|---|---|---|---|
| **Execuções (24h)** | `execucao_agente` | Agent Run | `GET /agentes/execucoes` | Não |
| **Taxa de sucesso** | `execucao_agente.status` | Agent Run | idem | Não — agregação |
| **Custo estimado** | `execucao_agente.custo_estimado` | Agent Run | — | **Sim** — depende da migration 053 |

---

## 3. Resumo de dependências

| Situação | Blocos |
|---|---|
| **Prontos hoje** (só frontend) | Human Gates pendentes · Análises em andamento · Novas oportunidades · Em destaque · Recomendações recentes · Execuções · Taxa de sucesso |
| **Exigem backend novo** | Oportunidades travadas · Funil agregado · Fatos novos |
| **Exigem migration** | Custo (053) · Reuniões (055) |
| **Exigem estrutura nova** | Big Moments |

**Sete dos treze blocos podem ser construídos sem tocar no backend.** É o
caminho recomendado para a primeira versão do dashboard.

---

## 4. Reaproveitamento de frontend

| Componente existente | Reaproveitável em |
|---|---|
| `Oportunidades.tsx` (236 linhas) | Faixa 1 e 2 — já lista e cura oportunidades |
| `Ranking.tsx` (150 linhas) | "Em destaque" — já ordena por score |
| `Funil.tsx` (379 linhas) | Bloco de funil — a lógica de agregação já existe |
| `Dashboard.tsx` (307 linhas) | Esqueleto e layout |
| `Artistas.tsx` (402 linhas) | Big Moments |

**`Funil.tsx` merece nota:** está órfã (sem link no menu) desde a Sprint 0A, mas
contém a lógica de agregação de que o bloco de funil precisa. **Antes de
descartar a página, extrair essa lógica.**

**Princípio de composição:** cada bloco declara sua origem e **degrada com
elegância quando vazio** — nunca inventa número. Enquanto uma fonte não existir,
o bloco fica visivelmente ausente, não preenchido com estimativa.

---

## 5. Navegação recomendada (§23)

Comparando a proposta do briefing com o estado atual (13 itens, 7 grupos):

```
DASHBOARD                          /

OPORTUNIDADES                      /oportunidades      ← inclui funil

RELACIONAMENTOS
├── Empresas                       /partes
├── Clientes                       /clientes           ← reintegrada
└── Artistas                       /artistas

INTELIGÊNCIA
├── Big Moments                    /artistas (aba)     ← sem página própria ainda
├── Reuniões                       /reunioes           ← FUTURA (migration 055)
└── Base de conhecimento           /conhecimento

DECISÃO
└── Score Cards                    /marcas

ADMINISTRAÇÃO
├── Importar dados                 /importar
├── Equipe & acessos               /usuarios
└── Configurações                  /configuracoes      ← absorve /criterios
```

**5 grupos · 11 itens** (contra 7 grupos e 13 itens hoje).

### Divergências deliberadas da proposta do briefing

| Item | Briefing | Recomendação | Por quê |
|---|---|---|---|
| Big Moments | Item próprio | **Aba dentro de Artistas** | Não há estrutura própria; item de menu apontaria para tela vazia |
| Documentos | "quando houver interface" | **Não incluir agora** | Concordo com a ressalva — não criar item sem tela |
| Reuniões | Item próprio | **Item, marcado como futuro** | Depende da migration 055 |
| Crossability | Dentro das análises | **Concordo** | Motor, não ferramenta operacional |
| Funil | Dashboard/Oportunidades | **Concordo** | Ver doc 02 §6 |
| Projetos | Perde protagonismo | **Sai do menu, condicionado** | Ver abaixo |

### Ponto que exige decisão humana

**`/projetos` continua condicionado.** O SAD §3.1 registra a semântica em
aberto, e os 3 registros reais (`ARAMIS`, `URBAN`, `ARAMIS NEXT`) organizam a
operação corrente da conta Aramis.

Com a nova regra de conversão (doc 01 §4), projeto passa a ser **resultado** de
oportunidade aprovada. Mas os projetos atuais **antecedem** essa regra.

> **Recomendação:** manter `/projetos` no menu até que existam oportunidades
> convertidas pelo novo fluxo. Retirá-lo antes deixaria a equipe sem forma de
> navegar o trabalho corrente.

---

## 6. Mudanças por dependência (§29)

### Sem backend novo — podem ser feitas já

| Mudança | Arquivos |
|---|---|
| Reestruturar menu para 5 grupos | `AppShell.tsx` |
| Retirar `/cronograma`, `/resumo`, `/frentes` do menu | `AppShell.tsx` |
| Reintegrar `/clientes` | `AppShell.tsx` |
| Mover `/criterios` para Configurações | `AppShell.tsx` |
| Dashboard com os 7 blocos prontos | `Dashboard.tsx` |
| Remover mocks de produção (pendência B.1) | `Partes.tsx`, `ParteDetalhe.tsx` |
| Esconder botão "Demo" | `AppShell.tsx` |

### Dependem do novo domínio

| Mudança | Depende de |
|---|---|
| Bloco "oportunidades travadas" | Endpoint novo |
| Funil dentro de Oportunidades | Endpoint de agregação |
| Página de Reuniões | Migration 055 |
| Bloco de custo | Migration 053 |
| Big Moments como entidade | Estrutura nova |
| Oportunidade sem projeto | Migrations de domínio |

---

## 7. Páginas — destino final

| Página | Destino |
|---|---|
| `Dashboard.tsx` | **Reescrita** — de resumo para atenção |
| `Oportunidades.tsx` | **Central** — ganha funil |
| `Partes.tsx` / `ParteDetalhe.tsx` | **Permanecem** — corrigir mocks |
| `Clientes.tsx` | **Reintegrada** |
| `Artistas.tsx` | **Permanece** — ganha aba Big Moments |
| `ScoreCard.tsx` / `Marcas.tsx` | **Permanecem** |
| `Ranking.tsx` | **Absorvida** pelo Dashboard |
| `Conhecimento.tsx` | **Permanece** — evolui na etapa de RAG |
| `Usuarios.tsx` / `ImportarDados.tsx` | **Permanecem** |
| `Criterios.tsx` | **Absorvida** por Configurações |
| `Funil.tsx` | **Lógica extraída**, página descontinuada |
| `Cronograma.tsx` / `Resumo.tsx` | **Escondidas** (rota preservada) |
| `Frentes.tsx` | **Escondida** — vira filtro |
| `ProjetoDetalhe.tsx` / `Projetos.tsx` | **Condicionadas** |
| `ParceriaDetalhe.tsx` | **Escondida** — vira histórico da parte |
| `Login.tsx` | **Permanece** |

**Nenhuma rota removida.** Páginas saem do menu, não do sistema.

**Continua em:** `05-cross-memory-vs-knowledge.md`.
