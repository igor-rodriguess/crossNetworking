# Internal Matching Agent — Output Showcase

**Sprint AI-05** · Modo estrutural / determinístico
Custo em IA paga: **US$ 0** · LLM calls: **0** · Embedding calls: **0**

> O produto deste agente é uma **shortlist rastreável para análise** — não uma
> recomendação, não uma decisão comercial.

---

## Limitação declarada antes dos resultados

```
REAL EMBEDDING:        NÃO HABILITADO
REAL PAIR REASONING:   NÃO HABILITADO
PAID LLM:              OFF

MATCHING ESTRUTURAL:   VALIDADO
QUALIDADE SEMÂNTICA:   PENDENTE
QUALIDADE DE IA REAL:  PENDENTE
```

Todo resultado carrega `nivel_validacao: "estrutural"` e
`validacao_semantica: "pendente_embedding_real"`. Quem consumir sabe o que está
recebendo.

---

## 1 · CLIENTE → PARCEIRO

**Origem:** Cliente Alfa (vinculada) — públicos *Jovens urbanos, Cultura de rua*;
territórios *Moda, Música*; segmento *Vestuário*
**Objetivo:** encontrar marcas para ativação cultural conjunta

### O funil

```
9 Partes ativas no pool
  ↓  filtros duros (SQL)
7 consideradas       — auto-match e exclusão explícita removidos
  ↓  deduplicação
5 pontuadas          — 2 marcas do mesmo grupo colapsadas
  ↓
5 na shortlist
```

### Shortlist

| # | Score | Candidato | Perfil | Enriquecer? | Sinais |
|--:|------:|---|---|---|---|
| 1 | **66.67** | Marca Aderente | completo | não | público=forte, território=forte, segmento=forte |
| 2 | **41.67** | Marca Parcial | parcial | sim | público=forte, território=forte |
| 3 | **35.71** | Beta Marca Dois | parcial | sim | público=forte |
| 4 | 0 | Marca Distante | parcial | sim | — |
| 5 | 0 | Marca Sem Perfil | ausente | sim | — |

### Excluídos

| Motivo | Qtd | Exemplo |
|---|--:|---|
| `auto_match` | 1 | Cliente Alfa não é candidata de si mesma |
| `excluido_explicitamente` | 1 | Marca Bloqueada, informada na requisição |
| `duplicado` | 2 | Beta Marca Um — mesmo grupo de Beta Marca Dois |

Marca Arquivada não aparece: filtrada no SQL por `arquivado_em`.

**Telemetria:** SQL 3ms · total 38ms · 0 LLM · 0 embeddings · US$ 0

---

## 2 · Por que A ficou acima de B

**Marca Aderente (66.67)** × **Marca Distante (0)** — só pelos componentes:

| Componente | Peso | Aderente | Distante |
|---|---:|---|---|
| público | 0.25 | *Jovens urbanos, Cultura de rua* → **1.0** | *Executivos* → **0.0** |
| território | 0.25 | *Moda, Música* → **1.0** | *Tecnologia* → **0.0** |
| segmento | 0.10 | *Vestuário* = *Vestuário* → **1.0** | *Software* ≠ *Vestuário* → **0.0** |
| ativo | 0.20 | *Festival próprio* vs *Programa de criadores* → 0.0 | sem cadastro → **desconhecido** |

Aderente tem sobreposição total em público e território; Distante tem zero. A
diferença é aritmética sobre sinais com proveniência — **nenhuma opinião de
parceria foi adicionada**.

Cada sinal aponta seu registro:
`cross_intelligence.parte_publico(parte_id=…)`,
`cross_intelligence.parte_territorio(parte_id=…)`.

---

## 3 · PARCEIRO → CLIENTE

**Origem:** Parceiro Gama · **Restrição:** apenas Clientes Cross reais

| Score | Candidato | É Cliente Cross? |
|------:|---|---|
| 62.5 | Cliente Alfa | ✅ |
| 62.5 | Cliente Delta | ✅ |

```
candidatos na shortlist que NÃO são Cliente Cross = 0
```

**Um achado durante a execução:** a primeira verificação usava o *papel*
`cliente` em `parte_papel` e acusou 1 falso positivo. "Cliente Alfa" é Cliente
Cross real, mas não tinha o papel cadastrado.

A autoridade é a **relação interna** `cross_commercial.cliente_cross`, não o
papel. O campo `eh_cliente_cross` foi exposto no candidato para que essa
verdade não precise ser re-derivada — e o teste passou a afirmar sobre ela.

---

## 4 · PROSPECÇÃO DO ZERO

**Origem:** "Marca Externa Não Cadastrada" — não existe na base.

```
vinculo:                  nao_vinculada
requer_resolucao_humana:  true
parte_id:                 null

Partes antes:  12
Partes depois: 12      ← nenhuma criada
```

Todos os candidatos ficaram com score 0: sem perfil de origem não há o que
comparar. **Isso é correto** — o agente não inventa sinais para preencher a
lacuna. Todos ficam `necessita_enriquecimento = true`.

---

## 5 · Candidato sem perfil — honestidade

**Marca Sem Perfil** entrou na shortlist com:

```
status_perfil:             ausente
necessita_enriquecimento:  true
elegibilidade:             elegivel_com_ressalva
sinais:                    todos "desconhecido"
pre_match_score:           0
```

E aparece em `nao_resolvidos`.

**Ponto central:** score 0 aqui significa **"nada avaliado"**, não
"incompatível". O candidato **não foi eliminado** — foi marcado para
enriquecimento.

A implementação sustenta isso: sinais `desconhecido` são **excluídos do
denominador** em vez de contarem zero. Um candidato com só público cadastrado,
e público idêntico ao da origem, pontua pelo que se sabe — não é penalizado
pelo que ainda não foi preenchido.

---

## 6 · Explosão de candidatos — 500 sintéticos

```
511 Partes no pool
  ↓  SQL LIMIT + filtros duros
 50 consideradas
  ↓  pontuação determinística
  5 na shortlist

0 chamadas de LLM
0 chamadas de embedding
US$ 0
30 ms
```

Os 461 cortados por teto ficam registrados como
`excedeu_limite_candidatos` — o corte é auditável, não silencioso.

Nenhum candidato dispara pesquisa externa ou raciocínio individual: o custo é
independente do tamanho da base.

---

## 7 · Empate estável

Dois candidatos idênticos recebem o mesmo score. O desempate é determinístico
em três níveis:

```
pre_match_score  →  nome (pt-BR)  →  parte_id
```

Coberto por teste: "Aaa Empate" sempre vem antes de "Zzz Empate", e duas
execuções idênticas devolvem exatamente a mesma ordem.

---

## 8 · O que o agente NÃO fez

Verificado por teste, comparando contagens antes e depois:

| Ação | Resultado |
|---|---|
| Oportunidade criada | **0** |
| Candidatura criada ou alterada | **0** |
| Projeto criado | **0** |
| Status de funil alterado | **0** |
| Score Card executado | **não** |
| Recommendation gerada | **não** |
| Chamada de LLM paga | **0** |
| Chamada de embedding paga | **0** |

O campo se chama `pre_match_score` deliberadamente. Encurtar para `score`
convidaria a leitura como nota comercial.

---

## 9 · Pesos de retrieval — o que eles não são

```
publico        0.25
territorio     0.25
ativo          0.20
relacionamento 0.10
geografico     0.10
segmento       0.10
momento        0.00     (sem fonte estruturada ainda)
```

Versão `retrieval-v1`, centralizada em `matching.schema.ts`.

**Estes pesos ordenam tecnicamente quem olhar primeiro.** Não são metodologia
Cross — a metodologia vive no Cross Knowledge, versionada, e sustenta o
Crossability. Chamá-los de metodologia seria inventar autoridade que não têm.

---

## Perguntas de validação humana

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | O universo faz sentido? | Sim — Partes ativas, filtradas por direção |
| 2 | Cliente → Parceiro correto? | Sim — não exige papel histórico de parceiro |
| 3 | Parceiro → Cliente limita a Clientes Cross? | Sim — 0 não-clientes |
| 4 | Candidatos errados excluídos? | Sim — auto-match, arquivada, exclusão, duplicado |
| 5 | Dá para saber por que A > B? | Sim — componentes com peso e contribuição |
| 6 | Confunde ausência com incompatibilidade? | **Não** — desconhecido sai do denominador |
| 7 | Candidato sem perfil é marcado? | Sim — `ausente` + `necessita_enriquecimento` |
| 8 | Existe candidate explosion? | Não — 511 → 50 → 5 |
| 9 | Alguma oportunidade criada? | Não |
| 10 | Alguma decisão comercial? | Não |
| 11 | Parece shortlist ou Recommendation disfarçada? | **Shortlist** |

---

## Limitações

1. **Sem validação semântica.** Comparação de públicos e territórios é
   sobreposição léxica de nomes cadastrados. "Jovens urbanos" e "Juventude
   urbana" não casam. Só embedding real resolve.
2. **Sinal de momento não implementado** (peso 0) — falta fonte estruturada de
   movimentos datados.
3. **Ativos comparados por nome**, o que raramente casa entre marcas
   diferentes; complementaridade real exige semântica.
4. **Sem persistência do resultado.** A infraestrutura de execução já existe;
   persistir shortlist como oportunidade seria justamente o que a Sprint proíbe.
5. **Cenário do showcase é sintético.** Dados fictícios, sem informação
   confidencial.
