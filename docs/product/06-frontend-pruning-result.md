# 06 — Resultado da Poda Visual do Frontend

**Plataforma Cross** · Sprint FE-01
Data: 15/08/2026

> Registro curto. O artefato de validação humana é
> [`validation/frontend-pruning-output-showcase.md`](validation/frontend-pruning-output-showcase.md).

---

## 1. Arquivos alterados

**Somente frontend.** Backend, banco, migrations e agentes: **zero alterações**.

| Arquivo | O que mudou |
|---|---|
| `components/AppShell.tsx` | Navegação reorganizada; botão Demo removido; rodapé; seletor de cliente; títulos |
| `components/CommandPalette.tsx` | Busca global passa a usar dados reais |
| `pages/Dashboard.tsx` | Reorientado para oportunidades; bloco de funil real |
| `pages/Oportunidades.tsx` | Link para o funil; título |
| `pages/Partes.tsx` | Contador de parcerias vindo da API |
| `pages/ParteDetalhe.tsx` | Histórico de parcerias vindo da API |
| `pages/ProjetoDetalhe.tsx` | Removido fallback em dados de exemplo |

**Nenhuma página foi apagada. Nenhuma rota foi removida.**

---

## 2. Mocks corrigidos

| Local | Antes | Depois |
|---|---|---|
| `Partes.tsx` | Contador de parcerias por Parte vinha do array `PARCERIAS` | `store.parcerias` (API) |
| `ParteDetalhe.tsx` | Lista "Parcerias formalizadas" vinha de `PARCERIAS` + `CLIENTES` | `store.parcerias` + `store.clientes` |
| `CommandPalette.tsx` | ⌘K listava clientes, projetos e frentes de exemplo | `store.clientes/projetos/frentes` |
| `ProjetoDetalhe.tsx` | Fallback `MARCAS.find(...)` ao resolver marca | Sem fallback fictício |

O achado do `CommandPalette` **não estava na auditoria anterior**: é um
componente global (⌘K em toda página) que oferecia clientes inexistentes e, ao
selecioná-los, ativava um cliente que não existe na base. Era o mock de maior
alcance da aplicação.

### Mocks remanescentes

| Local | Classificação | Justificativa |
|---|---|---|
| `data/mock.ts`, `data/mock-plataforma.ts` | **DEV_ONLY** | Arquivos de dados; nenhuma página os importa |
| `useStore.ts:944` (re-export) | **DEV_ONLY** | Reexporta para compatibilidade; sem consumidor em página visível |
| `useStore.restaurarDemo()` | **DEV_ONLY** | Ação preservada no store; inalcançável pela interface |
| `Resumo.tsx`, `Cronograma.tsx`, `ParceriaDetalhe.tsx` | **DEV_ONLY** | Usam `MARCAS`, mas são páginas **fora da navegação** |
| `frontend/src/**/*.test.ts` | **TEST_ONLY** | Fixtures legítimas |

**Nenhum `PRODUCTION_RISK` conhecido permanece nas páginas acessíveis pelo menu.**

> As três páginas escondidas ainda usam `MARCAS`. Não foram corrigidas porque
> saíram da experiência principal nesta sprint e a correção exigiria mudar
> telas que ninguém alcança pelo menu. Se voltarem à navegação, precisam ser
> corrigidas antes.

---

## 3. Navegação

**Antes:** 7 grupos · 13 itens · vocabulário operacional.
**Depois:** 6 grupos · 9 itens · vocabulário de inteligência.

```
Início            Dashboard
Oportunidades     Oportunidades          → botão "Ver funil"
Relacionamentos   Empresas · Clientes · Artistas
Inteligência      Base de conhecimento
Decisão           Score Cards
Administração     Importar dados · Equipe & acessos
```

### Saíram do menu (rota e código preservados)

`/projetos` · `/frentes` · `/criterios` · `/ranking` · `/cronograma` ·
`/resumo` · `/funil` (agora dentro de Oportunidades) · `/parcerias/:id`

---

## 4. Nomenclatura

| Antes | Depois |
|---|---|
| Central de operação | Dashboard |
| Oportunidades de IA | Oportunidades |
| Relacionamentos (item) | Empresas |
| Mapa de oportunidades | Score Cards |
| Relatórios & base RAG | Base de conhecimento |
| Projetos recentes | Iniciativas em andamento |
| "Conectado à API · dados reais" (rodapé) | "Cross Intelligence" |

---

## 5. Decisões tomadas

**O funil ficou dentro de Oportunidades (alternativa A+B).** Botão "Ver funil"
no cabeçalho de Oportunidades e bloco de distribuição no Dashboard. A página
`/funil` continua intacta — não foi reconstruída nem duplicada.

**O seletor de cliente parou de navegar.** Antes, trocar o cliente levava à
ficha da Parte, ou desviava para `/clientes` quando não havia `parteId`. Isso
era o único acesso a Clientes e um comportamento surpreendente. Agora só troca o
recorte; Clientes tem item próprio.

**Score Cards ficou em "Decisão", apontando para `/marcas`.** É a rota que já
lista as candidaturas avaliáveis e leva ao Score Card. Não criei rota nova.

**Crossability não virou item de menu.** Não existe página dedicada hoje; é
motor aplicado dentro das análises, conforme ADR-005.

**Reuniões e Documentos não entraram no menu.** Não há interface funcional —
criar item levaria a tela vazia. Reuniões dependem da migration 055.

---

## 6. Dashboard

| Bloco | Fonte | Estado |
|---|---|---|
| Hero — oportunidades em avaliação | `store.candidaturas` | **Funcional** |
| Indicadores (4) | `candidaturas`, `partes`, `parcerias` | **Funcional** |
| Funil por estágio | `store.candidaturas` + `STATUS_CANDIDATURA` | **Funcional** |
| Requer sua atenção | `papers`, `parcerias` | **Funcional** |
| Ciclo dos projetos | `store.projetos` | Funcional (contexto) |
| Iniciativas em andamento | `store.projetos` | Funcional (contexto) |

**Não implementados por falta de dado real:** Human Gates pendentes,
inteligências recentes, Big Moments e atividade recente. Nenhum foi simulado.

O bloco de funil lista **apenas estágios com oportunidades** — não desenha um
esqueleto de estados vazios, e nenhum estado novo foi inventado.

---

## 7. Dívida restante

| # | Item | Severidade |
|---|---|---|
| 1 | `Resumo`, `Cronograma`, `ParceriaDetalhe` ainda usam `MARCAS` | Baixa (fora do menu) |
| 2 | Sem bloco de Human Gate no Dashboard | Média (falta endpoint utilizável) |
| 3 | Big Moments sem entidade própria | Média |
| 4 | Reuniões dependem da migration 055 | Média |
| 5 | `/funil` e `/marcas` seguem como páginas separadas | Baixa |
| 6 | `data/mock*.ts` continuam no bundle | Baixa |

---

## 8. Validação

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | **0 erros** |
| `npm test` | **27/27** |
| `npm run build` | **sucesso** |
| Backend alterado | **ZERO** |
| Rotas removidas | **ZERO** |

> Não existe script `lint` no `package.json` do frontend. A verificação
> equivalente é `typecheck` (`tsc --noEmit`), que o `build` também executa.
