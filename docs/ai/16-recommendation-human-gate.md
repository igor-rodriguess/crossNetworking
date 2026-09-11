# 16 — Recommendation Human Gate

**Sprint AI-07A** · Documentação técnica curta.
Artefato principal: [output showcase](validation/recommendation-human-gate-output-showcase.md).

---

## Responsabilidade

Responde **"esta hipótese produzida pela inteligência merece ser promovida para
uma oportunidade operacional da Cross?"**.

Aprovar aqui **não** cria candidatura, Paper, Score Card, projeto, parceria nem
reunião. É o gate imediatamente anterior ao funil.

---

## Contrato

**Entrada** — `DecidirRevisaoInput`:

| Campo | Papel |
|---|---|
| `recomendacao_id` | Linha de `cross_ai.recomendacao` sob revisão |
| `decisao` | Uma das decisões abaixo |
| `motivo` | Justificativa livre |
| `edicoes` | Correções humanas (hipótese, observações, riscos, questões) |
| `versao_revisao_lida` | Optimistic locking |
| `override_insuficiente` | Reconhecimento ao decidir sem sustentação |

**Não existe `revisor_id` na entrada.** A identidade vem do contexto
autenticado — payload afirmando autoria não é prova de autoria.

**Saída** — `RevisaoRecomendacao`: decisão, revisor, `snapshot_ia`,
`edicoes_humanas`, motivo, flags, `versao_revisao`, timestamps.

---

## Estados de decisão

| Estado | Significado |
|---|---|
| `pendente` | Aguardando decisão |
| `aprovada_para_revisao_de_oportunidade` | Aceita para seguir à promoção — **sem** efeito operacional |
| `aprovada_com_edicoes` | Aceita com correção humana registrada |
| `rejeitada` | Recusada; tudo preservado |
| `requer_mais_informacao` | Marca `requer_enriquecimento`; não dispara pesquisa |

Não existe `aprovada_oportunidade` — nenhuma oportunidade existe ainda.

---

## Persistência

`cross_ai.recomendacao_revisao` (migration **059**), na camada de inteligência.

Não usa `candidatura_parceiro` como storage: guardar uma hipótese em tabela
operacional equivaleria a criar oportunidade por via indireta.

| Coluna | Papel |
|---|---|
| `recomendacao_id` + `recomendacao_versao` | A decisão vale para a versão lida |
| `snapshot_ia` | Congela o que a IA propôs |
| `edicoes_humanas` | Correções, em campo separado |
| `override_insuficiente` | Insuficiência reconhecida, nunca silenciada |
| `versao_revisao` | Optimistic locking |

---

## Idempotência

Índice único parcial:

```sql
CREATE UNIQUE INDEX uq_revisao_por_recomendacao
  ON cross_ai.recomendacao_revisao (recomendacao_id)
  WHERE decidido_em IS NOT NULL;
```

Reenviar a mesma decisão devolve a existente (`jaExistia: true`).

---

## Concorrência

Alterar decisão existente exige `versao_revisao_lida`. Divergência →
`ConflitoDeVersao`. O `UPDATE` também confere a versão na cláusula `WHERE`,
cobrindo corrida entre leitura e escrita.

---

## RN022 / RN023 — intocadas

O Score Card oficial exige `candidatura_parceiro_id` e `validacao_paper_id`
(ambos `NOT NULL`). Nenhuma constraint foi relaxada, nenhuma migration alterou
`cross_methodologies`.

Três testes verificam isso **lendo o `information_schema`**, não a documentação.

---

## Ligação com AI-07B

```
APPROVED_FOR_OPPORTUNITY_REVIEW
        ↓  [AI-07B — promoção humana explícita]
   candidatura_parceiro
        ↓
      Paper  →  aprovação (RN022)
        ↓
Score Card oficial (RN023)
```

A promoção será ação humana separada, não consequência automática desta
aprovação.

---

## Limitações

1. `nivel_validacao` permanece `estrutural` — IA real não homologada.
2. Sem frontend.
3. Sem RBAC/RLS específico; segue o padrão atual da plataforma.
4. `requer_mais_informacao` não dispara enriquecimento automático.
