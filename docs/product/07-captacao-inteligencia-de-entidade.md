# 07 — Captação de Inteligência de Entidade

**Plataforma Cross** · Consolidação pós AI-03
Data: 21/08/2026

> Decisão de produto sobre **de onde vêm** públicos, territórios e ativos — as
> três dimensões que o Crossability precisa e que a pesquisa web não entrega.

---

## O problema, medido

Rodadas de pesquisa dirigida contra fontes reais, com objetivos específicos
para cada dimensão:

| Rodada | Objetivos | Páginas | Fatos | `publicos` | `territorios` | `ativos` |
|---|---:|---:|---:|---:|---:|---:|
| AI-03 (1 objetivo) | 1 | 2 | 5 | **0** | **0** | **0** |
| Dirigida (4 objetivos) | 4 | 8 | 12 | **0** | 1 | **0** |
| Diversidade de domínio | 4 | 5 | 12 | **0** | **0** | **0** |

Mais objetivos e mais páginas produziram **mais que o dobro de fatos** — e
ainda assim as dimensões-alvo continuaram vazias.

### Primeira explicação: dominância do site oficial

Das 11 fontes aceitas na rodada dirigida, **8 eram o site oficial**. Ele passa
na credibilidade com score 95 e domina o ranking do buscador.

E o site institucional **não descreve o próprio público**. Ele vende produto.
O resultado foram fatos como *"Converse tem termos de uso e política de
privacidade"* — verdadeiros, rastreáveis, e inúteis para avaliar encaixe.

Corrigido com um teto de 2 fontes por domínio.

### A explicação real: dois defeitos nossos

A conclusão inicial foi **"a informação não está na web"**. Ao auditar os dados
brutos em vez de aceitar o número, apareceram duas causas internas.

**Defeito 1 — classificação errada.** A rodada com diversidade produziu 12
fatos, e entre eles estavam:

```
"A marca Converse propõe engajamento da visibilidade
 dos jovens da sua comunidade"          → classificado como campanha
"Converse All Stars is a program to support
 the world's best emerging creators"    → classificado como movimento_estrategico
```

O primeiro é **público**. O segundo é **ativo de marca** — exatamente o que o
Crossability mais precisa. A web entregou; o pipeline arquivou na gaveta errada
e o perfil reportou zero.

Causa: o prompt listava as 16 categorias como vocabulário plano, **sem
definição**. O modelo escolhia a palavra mais familiar.

**Defeito 2 — lista de veículos como teto.** Dos 40 descartes, **24 eram
`dominio_nao_reconhecido` com score 50** — todos idênticos. O objetivo
`territorios_atuacao` terminou com **zero fontes aceitas**.

A credibilidade dependia de uma allowlist de ~30 domínios. Qualquer veículo fora
dela era barrado, por mais legítimo que fosse. Não era o mundo que estava vazio;
era a lista que era pequena.

### O que ficou de pé

Auditados os 24 descartes, a maioria **merecia** ser barrada: Scribd, Studocu,
Wikipedia, Glassdoor, Instagram, SWOT de estudante. A suposição de que havia 24
boas fontes perdidas estava errada.

Mas duas eram reais — uma matéria de *style guide* sobre subculturas e collabs,
e um portal de varejo setorial. Conteúdo de público e ativos, barrado por não
ter `/noticias/` na URL.

### A conclusão revisada

A web entrega **mais do que o medido**, e as correções abaixo recuperam parte
disso. Mas continua valendo que público e ativos raramente estão publicados de
forma completa — e **esse é o diferencial da Cross**. Se estivesse tudo no
Google, não teria valor competitivo. Quem sabe é quem sentou na reunião.

Por isso as duas vias são complementares, não alternativas.

---

## Correções aplicadas na busca online

### 1. Definição de categoria no prompt

O prompt passou a **definir** cada categoria, marcando `publico`, `territorio` e
`ativo` como prioritárias, com exemplos e regra de desempate.

### 2. Reclassificação determinística

Uma passada léxica reencaminha um claim **já validado** para a seção correta.
Não cria fato, não altera texto, não relaxa nenhuma barreira — roda depois de
todas elas.

Ordem: `ativo` → `publico` → `territorio`. Um programa próprio quase sempre cita
o público que atende; classificá-lo como público perderia o ativo, que é o mais
escasso dos três.

**Resultado nos 12 fatos reais da rodada anterior:**

| Antes | Depois | Claim |
|---|---|---|
| `campanha` | **`publico`** | artistas da comunidade global Converse |
| `campanha` | **`publico`** | engajamento dos jovens da sua comunidade |
| `movimento_estrategico` | **`ativo`** | All Stars **is a program** to support emerging creators |
| `movimento_estrategico` | **`ativo`** | **global network of** like-minded talent |

`publicos: 0 → 2` e `ativos: 0 → 2`, **sem nova busca e sem nova chamada de
LLM**. A informação já estava no pacote.

Falsos positivos foram controlados: "ação global … murais em várias cidades"
continua `campanha`, não vira território.

### 3. Credibilidade por sinais, não só por lista

Um domínio fora da allowlist agora pode **provar** ser editorial: seção de
notícia, permalink datado, nome de veículo, editoria relevante, seção analítica.

Dois limites preservam a hierarquia:
- **Teto de 72** — não catalogado nunca supera curado (75) ou referência (85)
- **Lista de não-editoriais** — Scribd, Studocu, Wikipedia, Instagram,
  Glassdoor, repositórios acadêmicos e fazendas de conteúdo de "marketing
  strategy" são barrados por natureza, com qualquer URL

Reavaliando os 24 descartes reais: junk caiu de score 54 para 25, e uma matéria
de *style guide* sobre subculturas e collabs — conteúdo de público e ativos —
passou a ser aceita.

---

## O que NÃO foi validado

A validação live das mudanças de gate **não foi concluída**. Duas tentativas:

| Tentativa | Resultado |
|---|---|
| Termos ampliados + mais resultados | **Regressão: 12 → 0 fatos.** Termos soltos ("subcultura cena juventude") trouxeram artigo acadêmico sobre subculturas em geral, e o mix de consultas expulsou as fontes boas |
| Termos revertidos | **Inválida:** DuckDuckGo retornou **403 (rate limit)** |

A primeira tentativa ensinou algo aproveitável e já corrigido: termo de busca
precisa ficar **ancorado na marca**. "subcultura cena juventude" virou
"subculturas que usam a marca reportagem".

A segunda não mede nada — o provedor recusou todas as consultas.

**Portanto:** as melhorias de classificação estão comprovadas contra dados reais
(item 2, verificável offline). As de credibilidade estão comprovadas em teste
unitário contra URLs reais, mas **ainda não numa execução ponta a ponta**.
Rodar de novo depois que o rate limit expirar.

---

## A decisão

Duas vias complementares, **A + B**:

```
A. FORMULÁRIO ESTRUTURADO        B. CAPTURA A PARTIR DA REUNIÃO
   ficha da Empresa                 ata/notas → extração → confirmação
   preenchimento direto             preencher vira REVISAR
        │                                   │
        └───────────┬───────────────────────┘
                    ▼
          cross_intelligence
                    ▼
        Entity Intelligence Profile
          (proveniência: INTERNA)
                    ▼
              Crossability
```

**Descartado: chat conversacional.** Menor atrito para o usuário, mas produz
texto livre — e o Crossability precisa de campos, não de conversa.

---

## Situação de A: **já existe**

A auditoria encontrou a via manual **construída e funcionando**:

| Camada | Situação |
|---|---|
| Tabelas | `parte_publico`, `parte_territorio`, `parte_praca`, `ativo`, `perfil_estrategico` |
| Rotas | `POST /partes/:id/publicos`, `/territorios`, `/pracas`, `/ativos`, `/perfis-estrategicos` |
| Frontend | Formulário em `ParteDetalhe.tsx` com Público-alvo, Territórios, Praças |
| Persistência | `salvarInteligenciaParte()` → API real, com vigência |

**Nada precisou ser construído.** A captação manual funciona hoje.

### O elo que faltava

O Entity Intelligence **não lia** esses dados. `DadosInternos` aceitava papéis,
oportunidades, parcerias e projetos — mas não públicos, territórios nem ativos.

Corrigido: o perfil agora consolida a inteligência interna com proveniência
`interno`, apontando para `cross_intelligence`.

**Efeito imediato:** com a ficha preenchida, as três lacunas desaparecem.

---

## Situação de B: depende da migration 055

A captura por reunião precisa que a reunião exista ligada a uma **Parte**, não
a uma parceria fechada.

Hoje `cross_execution.reuniao.parceria_id` é `NOT NULL` — uma conversa com uma
marca que ainda não é parceira **não tem onde ser registrada**.

A migration está **proposta e documentada** em
[`03-meeting-domain-evolution.md`](03-meeting-domain-evolution.md): 5 colunas
aditivas, `DROP NOT NULL`, retrocompatível.

**Fluxo alvo:**

```
ata da reunião → Meeting Intelligence extrai campos
                          ↓
                  ═══ HUMAN GATE ═══
                  humano confirma/edita
                          ↓
                  cross_intelligence
```

Preencher vira **revisar** — muito menos atrito que um formulário vazio.

---

## Separação de origens preservada

Um ponto que a arquitetura já garante e que vale registrar:

| Origem | Autoridade sobre | Proveniência |
|---|---|---|
| **Interna** (reunião, briefing) | público, territórios, ativos, objetivos | `registro_interno: cross_intelligence(...)` |
| **Externa** (web) | movimentos, produtos, campanhas, situação | `evidence_refs` + `source_refs` |

Os campos são mutuamente exclusivos — coberto por teste. O Crossability
receberá as duas, sabendo qual é qual.

E pelo ADR-010: informação de reunião é **Cross Memory**. Só vira conhecimento
validado após Human Gate.

---

## O que fica pendente

| # | Item | Depende de |
|---|---|---|
| 1 | Validação live dos gates de credibilidade | rate limit do DuckDuckGo expirar |
| 2 | Migration 055 (reunião ligada a Parte) | decisão de aplicar |
| 3 | Meeting Intelligence | migration 055 |
| 4 | Provedor de busca com contrato (evitar 403) | decisão de custo |

O item 4 apareceu na prática: o DuckDuckGo gratuito bloqueia após poucas
execuções seguidas, o que inviabiliza tanto validação quanto uso real com
volume. É uma decisão de custo a tomar antes de operar em escala.

### Feito nesta rodada (frontend)

- **Aviso de lacunas do Crossability** na ficha da Empresa: mostra quais das
  três dimensões faltam, com contador `n/3`, e abre o formulário já preenchido
- **Empty state de ativos** agora explica que ativo é o que o Crossability usa
  para achar encaixe e que raramente está publicado na web

---

## Resposta à pergunta original

> *"Não sei como inserir essas informações dentro da plataforma."*

**Já dá para inserir hoje**, na ficha da Empresa (`/partes/:id`), campos
Público-alvo, Territórios e Praças. O dado persiste em `cross_intelligence` e
agora alimenta o Entity Intelligence Profile.

O que falta é (a) campo de ativos no formulário, (b) sinalizar as lacunas para
motivar o preenchimento, e (c) a captura por reunião, que reduz o atrito.
