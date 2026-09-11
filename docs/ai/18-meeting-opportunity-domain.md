# 18 — Domínio de Reunião + Oportunidade

**Sprint DOMAIN-01** · Documentação técnica curta.
Artefato principal: [output showcase](validation/meeting-opportunity-domain-output-showcase.md).

---

## O problema corrigido

`cross_execution.reuniao.parceria_id` era `NOT NULL`. Nenhuma reunião podia
existir sem parceria fechada — e parceria, por sua vez, exigia candidatura +
projeto + frente + decisão aprovada + Paper validado (WAD 7.3.14).

Para registrar uma conversa, o sistema pedia o processo inteiro. A ordem real é
a inversa: a conversa vem primeiro e decide se haverá parceria.

---

## Modelo final

```
cross_execution.reuniao
├── parceria_id              OPCIONAL   → cross_partnerships.parceria    (legado)
├── candidatura_parceiro_id  OPCIONAL   → cross_projects.candidatura_parceiro
├── projeto_id               OPCIONAL   → cross_projects.projeto
├── tipo                     NOT NULL   default 'reuniao'
├── status                   NOT NULL   default 'planejada'
└── auditoria                criado_por_id, criado_em, atualizado_*, arquivado_*

cross_execution.reuniao_participante        (já existia)
├── reuniao_id     NOT NULL
├── parte_id       XOR usuario_interno_id
└── papel
```

`tipo`: `reuniao` · `exploratoria` · `apresentacao` · `negociacao` · `acompanhamento`
`status`: `planejada` · `realizada` · `cancelada`

---

## Invariantes

| # | Regra | Onde |
|--:|---|---|
| 1 | Participante é Parte **ou** usuário interno, nunca ambos | `ck_reuniao_participante_alvo` |
| 2 | Candidatura e projeto, quando ambos presentes, pertencem à mesma cadeia | `trg_reuniao_validar_contexto` |
| 3 | Status restrito a três valores; não existe `aprovada` | `ck_reuniao_status` |
| 4 | Apagar contexto não apaga reunião | `ON DELETE SET NULL` |

A invariante 2 valida por `candidatura → frente_oportunidade → projeto`. Só age
quando os dois campos existem — contexto ausente não é erro.

---

## Backward compatibility

| Item | Situação |
|---|---|
| `POST /v1/parcerias/:id/reunioes` | inalterada |
| `GET /v1/parcerias/:id/reunioes` | inalterada |
| `criarReuniao()` | inalterada, ainda exige parceria |
| `inserirReuniao()` | preservada |
| Reuniões com `parceria_id` | continuam válidas e listáveis |

O caminho novo (`criarReuniaoComContexto`, `inserirReuniaoComContexto`) convive
com o legado em vez de substituí-lo.

---

## Consultas

```ts
listarReunioesPorParte(parteId)         // via reuniao_participante
listarReunioesPorCandidatura(candId)    // oportunidade
listarReunioesPorProjeto(projetoId)     // projeto
listarReunioes(parceriaId)              // legado, preservada
```

São as perguntas que o Meeting Intelligence (AI-08) fará.

---

## Migration 061

Aditiva:

1. `parceria_id` → `DROP NOT NULL`
2. `+ candidatura_parceiro_id`, `+ projeto_id` (`ON DELETE SET NULL`)
3. `+ tipo`, `+ status` com CHECK
4. `+ trg_reuniao_validar_contexto`

Índices parciais em `candidatura_parceiro_id` e `projeto_id` (só linhas não
nulas). Nenhuma coluna removida; nenhuma migration histórica editada.

---

## Gaps

1. **`OPPORTUNITY_TO_PROJECT_TRIGGER = BUSINESS_DECISION_PENDING`** — qual
   evento converte Oportunidade em Projeto continua indefinido. Reunião não é
   gatilho; Score Card não é gatilho.
2. **Sem rota HTTP** para criação com contexto flexível — service pronto.
3. **Sem Human Gate de reunião** — não existia no domínio; não foi criado.
4. **Volume histórico não medido** — banco de teste vazio; confirmar em staging
   antes de produção.
5. **Frontend** consome a rota legada, que segue funcionando.
