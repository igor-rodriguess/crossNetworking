# Poda Visual — Showcase de Validação

**Plataforma Cross** · Sprint FE-01
Data: 15/08/2026

> **Sobre screenshots:** este ambiente não tem navegador headless disponível
> (sem Playwright/Puppeteer instalado). Não inventei imagens. O que segue é a
> estrutura real, extraída do código após as alterações — rotas de `App.tsx`,
> itens de `AppShell.tsx` e fontes de dado verificadas arquivo a arquivo.
>
> Validação: `typecheck` 0 erros · `npm test` 27/27 · `npm run build` sucesso ·
> backend alterado: **zero**.

---

## 1. MENU — antes → depois

```
ANTES  (7 grupos · 13 itens)              DEPOIS  (6 grupos · 9 itens)
─────────────────────────────────         ─────────────────────────────────
Operar hoje                               Início
  Central de operação                       Dashboard
Inteligência Cross                        Oportunidades
  Oportunidades de IA                       Oportunidades      → [Ver funil]
  Relatórios & base RAG                   Relacionamentos
Descobrir                                   Empresas
  Relacionamentos                           Clientes           ← REINTEGRADO
  Mapa de oportunidades                     Artistas
  Artistas & momentos                     Inteligência
Estruturar                                  Base de conhecimento
  Projetos & briefings         ← saiu    Decisão
  Mapeamento de oportunidades  ← saiu      Score Cards
Avaliar & decidir                         Administração
  Critérios & pesos            ← saiu      Importar dados
  Ranking & decisões           ← saiu      Equipe & acessos
Executar & medir
  Cronograma de parcerias      ← saiu
  Resultados & resumo          ← saiu
Administração
  Importar dados
  Equipe & acessos

RODAPÉ                                    RODAPÉ
"Conectado à API · dados reais"           "Cross Intelligence"

SIDEBAR                                   SIDEBAR
[Demo] [Sair]                             [Sair]        ← Demo REMOVIDO
```

**A leitura mudou:** os grupos deixaram de descrever o fluxo operacional
(*estruturar → avaliar → executar → medir*) e passaram a descrever a lógica de
inteligência (*oportunidade → relacionamento → decisão*).

---

## 2. MOCK CORRIGIDO — cenário obrigatório

### 2.1 `Partes.tsx` — contador de parcerias por empresa

```
ANTES
─────
import { PARCERIAS } from '../data/mock';      ← array estático

for (const p of PARCERIAS) {                   ← 6 parcerias fictícias
  const reg = mapa.get(p.marcaId);
  if (reg) reg.parcerias += 1;
}

RESULTADO NA TELA: "Com parceria: N"
                   N calculado sobre dados de exemplo, exibido ao usuário
                   como se fosse a base real da conta Aramis.

DEPOIS
──────
const parcerias = useStore((s) => s.parcerias);  ← API: GET /parcerias
useEffect(() => { carregarParcerias(); }, []);

for (const p of parcerias) { ... }

RESULTADO NA TELA: o mesmo contador, agora sobre parcerias reais do cliente
                   ativo. Se a API falhar, fica 0 — nenhum número é inventado
                   para preencher a lacuna.
```

### 2.2 `ParteDetalhe.tsx` — seção "Parcerias formalizadas"

```
ANTES    PARCERIAS.filter(p => p.marcaId === parte.id)
         + CLIENTES.find(...)!        ← nome de cliente fictício, non-null assertion

DEPOIS   store.parcerias.filter(...)  ← API
         + store.clientes.find(...)   ← sem "!"; cliente ausente omite o vínculo
                                         em vez de exibir nome inventado

EMPTY STATE (preservado, agora verdadeiro):
  "Nenhuma parceria formalizada ainda"
  "Acompanhe as candidaturas acima e formalize a parceria quando a
   negociação evoluir."
```

### 2.3 `CommandPalette.tsx` — achado NOVO, não previsto na auditoria

Este era o mock de maior alcance: a busca global (⌘K), presente em **todas** as
páginas.

```
ANTES
─────
import { CLIENTES, FRENTES, PROJETOS } from '../store/useStore';

for (const c of CLIENTES)  → lista clientes de exemplo
   ir: () => setClienteAtivo(c.id)   ← ATIVAVA UM CLIENTE QUE NÃO EXISTE
for (const p of PROJETOS)  → lista projetos de exemplo

DEPOIS
──────
const clientes = useStore((s) => s.clientes);   ← API
const projetos = useStore((s) => s.projetos);   ← API
const frentes  = useStore((s) => s.frentes);    ← API
```

**Impacto:** um usuário que abrisse ⌘K via clientes e projetos inexistentes; ao
selecionar um, a plataforma trocava para um cliente fantasma.

### 2.4 `ProjetoDetalhe.tsx` — fallback silencioso

```
ANTES   partes.find(...) ?? MARCAS.find(...) ?? { nome: 'Parceiro' }
DEPOIS  partes.find(...) ?? { nome: 'Parceiro' }
```

### Busca final por mocks

| Padrão | Onde permanece | Classe |
|---|---|---|
| `PARCERIAS` (array) | `data/mock.ts` apenas | DEV_ONLY |
| `MARCAS` | `Resumo`, `Cronograma`, `ParceriaDetalhe` — **todas fora do menu** | DEV_ONLY |
| `CLIENTES`/`PROJETOS`/`FRENTES` | re-export em `useStore.ts`, sem consumidor visível | DEV_ONLY |
| `restaurarDemo` | store; inalcançável pela UI | DEV_ONLY |
| fixtures `*.test.ts` | testes | TEST_ONLY |

**PRODUCTION_RISK remanescente nas páginas do menu: nenhum.**

---

## 3. DASHBOARD — antes → depois

```
ANTES                                     DEPOIS
─────────────────────────────────         ─────────────────────────────────
"Panorama geral dos projetos e            "O que precisa da sua atenção hoje
 oportunidades..."                          na operação da Cross."

HERO                                      HERO
 "N projetos em movimento."                "N oportunidades em avaliação."
 [Ver todos os projetos]                   [Ver oportunidades]

INDICADORES                               INDICADORES
 Projetos em andamento    ← 1º             Oportunidades          ← 1º
 Em negociação                             Em negociação
 Parcerias ativas                          Empresas na base
 Partes na base                            Parcerias ativas       ← 4º

 (sem bloco de funil)                     FUNIL DE OPORTUNIDADES  ← NOVO
                                           distribuição real por estágio
                                           [Visão completa → /funil]

 Ciclo dos projetos                        Ciclo dos projetos     (contexto)
 Requer sua atenção                        Requer sua atenção
 "Projetos recentes"                       "Iniciativas em andamento"
```

### Blocos e suas fontes

| Bloco | Fonte de dado | Estado |
|---|---|---|
| Hero — oportunidades em avaliação | `store.candidaturas` (`GET /frentes/:id/candidaturas`) | **FUNCIONAL AGORA** |
| Indicador · Oportunidades | `store.candidaturas` | **FUNCIONAL AGORA** |
| Indicador · Em negociação | `candidaturas.status === 'em_negociacao'` | **FUNCIONAL AGORA** |
| Indicador · Empresas na base | `store.partes` (`GET /partes`) | **FUNCIONAL AGORA** |
| Indicador · Parcerias ativas | `store.parcerias` (`GET /parcerias`) | **FUNCIONAL AGORA** |
| Funil por estágio | `candidaturas` + `STATUS_CANDIDATURA` (16 estados reais) | **FUNCIONAL AGORA** |
| Requer sua atenção | `store.papers`, `store.parcerias` | **FUNCIONAL AGORA** |
| Ciclo dos projetos | `store.projetos` | Funcional (contexto) |
| Iniciativas em andamento | `store.projetos` | Funcional (contexto) |
| Human Gates pendentes | — | **OMITIDO** — sem endpoint utilizável |
| Inteligências recentes | — | **OMITIDO** — depende dos agentes |
| Big Moments | — | **OMITIDO** — sem entidade própria |
| Atividade recente | — | **OMITIDO** — sem feed real |

**Quatro blocos foram deliberadamente omitidos.** Nenhum foi preenchido com
dado fictício para "completar" o painel.

### Empty state do funil

```
"Nenhuma oportunidade no funil deste cliente. Quando a Cross Intelligence
 identificar novas oportunidades, a distribuição por estágio aparece aqui."
```

Texto explicativo, não dado simulado. E o bloco lista **apenas estágios com
oportunidades** — não desenha 16 linhas zeradas.

---

## 4. OPORTUNIDADES ↕ FUNIL

```
ROTA /oportunidades                            ROTA /funil
─────────────────────────────                  ─────────────────────────────
Oportunidades                    ← título      Funil de oportunidades
[Ver funil] [Pesquisar briefing] ← ações       (página intacta, Kanban
                                                 existente reaproveitado)
Sugestões do pipeline de IA,
com fit Crossability, fontes
e briefing inicial.
        │
        └──── [Ver funil] ───────────────────────────▶ /funil
```

| Verificação | Resultado |
|---|---|
| `/funil` continua acessível | **Sim** — botão em Oportunidades + link no Dashboard |
| `/funil` foi apagado | **Não** — rota e página intactas |
| Kanban reconstruído | **Não** — reaproveitado |
| Oportunidade ganhou protagonismo | **Sim** — grupo próprio, 2º no menu; hero do Dashboard |
| Projeto perdeu protagonismo | **Sim** — saiu do menu; virou "contexto" no Dashboard |

---

## 5. CLIENTES

```
ANTES                                      DEPOIS
─────                                      ──────
Sem item de menu.                          Relacionamentos → Clientes

Único acesso: seletor de cliente no        Item explícito. O seletor apenas
topo, que ao trocar navegava para          troca o recorte da plataforma,
/partes/:id — ou desviava para             sem navegar.
/clientes quando não havia parteId.

  navigate(c.parteId                         setClienteAtivo(c.id);
    ? `/partes/${c.parteId}`                 setAberto(false);
    : '/clientes');                          // sem navigate
```

**Dados:** `store.clientes` ← `GET /clientes`.

---

## 6. EMPRESAS (`/partes`)

| Elemento | Fonte |
|---|---|
| Lista de Partes | `GET /partes` |
| Filtros: todos · clientes · organizações · pessoas | `parte.papeis`, `parte.tipo` |
| Indicador · Partes cadastradas | `store.partes` |
| Indicador · Organizações / Pessoas | `store.partes` |
| Indicador · Clientes Cross | `parte.papeis.includes('cliente')` |
| **Indicador · Com parceria** | **`store.parcerias`** ← corrigido |
| Contador por Parte (candidaturas/parcerias) | `store.candidaturas` + `store.parcerias` |

A tela já refletia a decisão de domínio — **uma Parte, vários papéis** — através
de `parte.papeis`. Nenhuma duplicação visual foi criada.

> Não incluí print de uma empresa real: exibir dados da conta Grupo Aramis num
> documento versionado no repositório não me pareceu adequado sem sua
> autorização. A estrutura acima descreve exatamente o que a tela mostra.

---

## 7. SCORE CARD

```
Decisão → Score Cards → /marcas → /marcas/:candidaturaId
```

| Verificação | Resultado |
|---|---|
| Acessível pelo menu | **Sim** — grupo "Decisão" |
| Cálculo alterado | **Não** |
| Pesos alterados | **Não** |
| RN022 / RN023 tocadas | **Não** |
| Human Gate alterado | **Não** |

Nenhuma linha de `ScoreCard.tsx` foi modificada.

---

## 8. MAPA DE ROTAS

**21 rotas registradas · 21 preservadas · 0 removidas.**

| Rota | Status visual | Ação |
|---|---|---|
| `/` | VISIBLE_PRIMARY | Dashboard reorientado |
| `/oportunidades` | VISIBLE_PRIMARY | Protagonismo + link do funil |
| `/partes` | VISIBLE_PRIMARY | Mock corrigido |
| `/clientes` | VISIBLE_PRIMARY | **Reintegrada ao menu** |
| `/artistas` | VISIBLE_PRIMARY | Sem alteração |
| `/conhecimento` | VISIBLE_PRIMARY | Renomeada no menu |
| `/marcas` | VISIBLE_PRIMARY | Agora "Score Cards" |
| `/importar` | VISIBLE_PRIMARY | Sem alteração |
| `/usuarios` | VISIBLE_PRIMARY | Sem alteração |
| `/partes/:parteId` | VISIBLE_SECONDARY | Mock corrigido |
| `/marcas/:candidaturaId` | VISIBLE_SECONDARY | Score Card — intacto |
| `/projetos/:projetoId` | VISIBLE_SECONDARY | Fallback de mock removido |
| `/funil` | VISIBLE_SECONDARY | Acessível por Oportunidades e Dashboard |
| `/login` | VISIBLE_SECONDARY | Sem alteração |
| `/projetos` | HIDDEN_FROM_NAV | Perdeu protagonismo |
| `/frentes` | HIDDEN_FROM_NAV | Vira recorte de oportunidade |
| `/criterios` | HIDDEN_FROM_NAV | Configuração, não operação |
| `/ranking` | HIDDEN_FROM_NAV | Absorvido conceitualmente |
| `/cronograma` | LEGACY_PRESERVED | Execução sai do centro |
| `/resumo` | LEGACY_PRESERVED | Execução sai do centro |
| `/parcerias/:parceriaId` | LEGACY_PRESERVED | Vira histórico da Parte |
| `*` | — | Redirect para `/` |

**BROKEN: nenhuma.** Todas as rotas resolvem para uma página existente.

---

## 9. RESPONSIVIDADE

O drawer mobile, o backdrop, o `Esc` e o `lg:` da sidebar não foram tocados —
só o conteúdo do array `NAVEGACAO` mudou. As ações de Oportunidades ganharam
`flex-wrap`, então o botão "Ver funil" quebra linha em viewport estreita em vez
de estourar o cabeçalho.

Menos itens de menu significa menos rolagem na sidebar em telas baixas.

> Validação visual em navegador não foi executada (sem ferramenta de screenshot
> neste ambiente). O build passa e nenhuma classe de layout foi alterada.

---

## 10. Resposta direta

**"A plataforma parece uma plataforma de inteligência de negócios?"**

O que sustenta o *sim*:

- o primeiro grupo de trabalho é **Oportunidades**, não Projetos
- o Dashboard abre com *"N oportunidades em avaliação"* e com o funil real
- Projeto virou "contexto"; execução, cronograma e resultados saíram do caminho
- o vocabulário fala de oportunidade, decisão e conhecimento

O que ainda **não** sustenta:

- não há bloco de Human Gate — falta endpoint
- não há inteligência recente — faltam os agentes
- Reuniões e Big Moments não existem como área
- Crossability ainda não aparece dentro da análise: saiu do menu, mas o destino
  final depende dos agentes

**A poda foi feita. A inteligência que vai ocupar o espaço ainda será
construída.** A interface está honesta sobre isso: onde não há dado, não há
bloco — e não há número inventado.
