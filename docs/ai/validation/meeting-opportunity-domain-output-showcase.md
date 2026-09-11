# Domínio de Reunião + Oportunidade — Output Showcase

**Sprint DOMAIN-01** · Pré-requisito para AI-08
Custo em IA: **US$ 0** · Nenhum agente envolvido

---

## BEFORE — por que a reunião dependia de parceria

A auditoria encontrou isto:

```
table:       cross_execution.reuniao
column:      parceria_id          NOT NULL
constraint:  fk_reuniao_parceria → cross_partnerships.parceria(id) ON DELETE RESTRICT
service:     execucao.service.criarReuniao() → garantirParceria()
route:       POST /v1/parcerias/:id/reunioes   (parceria no próprio caminho)
```

**Nenhuma reunião podia existir sem uma parceria já fechada.**

### E a dependência era ainda mais profunda

Ao tentar montar o fixture legado, o domínio revelou a cadeia inteira:

```
cross_partnerships.parceria exige:
  ├─ candidatura_parceiro_id   NOT NULL
  ├─ projeto_id                NOT NULL
  ├─ frente_oportunidade_id    NOT NULL
  ├─ cliente_cross_id          NOT NULL
  ├─ decisão de aprovação da candidatura   (WAD 7.3.14)
  └─ Paper validado na frente              (WAD 7.3.14)
```

Ou seja: para registrar **uma conversa**, o sistema exigia candidatura +
projeto + frente + cliente + decisão aprovada + Paper validado.

Isso inverte a ordem real do negócio. A conversa acontece **antes** — e é ela
que decide se vai existir parceria.

**Consequência prática:** uma reunião exploratória com uma marca em prospecção
simplesmente não tinha onde ser registrada.

---

## AFTER — o modelo normalizado

```
REUNIAO
├── participantes (reuniao_participante)   →  N Partes + N usuários Cross
├── parceria_id             OPCIONAL / legado
├── candidatura_parceiro_id OPCIONAL       →  oportunidade
├── projeto_id              OPCIONAL       →  projeto
├── tipo                    reuniao | exploratoria | apresentacao | negociacao | acompanhamento
├── status                  planejada | realizada | cancelada
└── auditoria               criado_por_id, criado_em, …
```

Migration **061**, aditiva. Nenhuma coluna removida, nenhum dado perdido.

---

## Os quatro contextos, executados de verdade

### 1 · PRÉ-OPORTUNIDADE

```
"Primeira conversa exploratória"
parceria=null  candidatura=null  projeto=null
participantes: 2   tipo=exploratoria   status=planejada
```

**Era impossível antes da 061.** Duas Partes conversando, sem nenhuma estrutura
formal — o caso mais comum do início do funil.

### 2 · OPORTUNIDADE

```
"Negociação da oportunidade"
parceria=null  candidatura=SIM  projeto=null
```

**Era impossível antes da 061.** Este é o caso que a AI-07B tornou necessário:
a candidatura existe, mas não há parceria nem projeto.

### 3 · PROJETO

```
"Acompanhamento do projeto"
parceria=null  candidatura=null  projeto=SIM
```

Projeto sem exigir parceria.

### 4 · LEGADO DE PARCERIA

```
"Reunião de parceria (legado)"
parceria=SIM  candidatura=null  projeto=null

rota legada /parcerias/:id/reunioes devolve: 1
```

**Retrocompatibilidade preservada.** A rota antiga continua funcionando, e a
reunião legada continua visível por ela.

---

## Múltiplas Partes + usuário interno

```
Parte   cliente
Parte   parceiro
Parte   artista
Cross   cross
```

A tabela `reuniao_participante` **já existia** e já resolvia isto — não foi
preciso criar sistema de participantes.

Ela distingue os dois conceitos por CHECK:

```sql
ck_reuniao_participante_alvo
CHECK (usuario_interno_id IS NOT NULL AND parte_id IS NULL
    OR usuario_interno_id IS NULL AND parte_id IS NOT NULL)
```

Participante é **Parte OU usuário Cross**, nunca ambos. Coberto por teste.

---

## Consultas para o Meeting Intelligence

```
por Parte (Marca Prospect):  3 reuniões
por Oportunidade:            1 reunião
por Projeto:                 1 reunião
```

As três perguntas que o AI-08 fará já são respondíveis. A consulta por Parte
atravessa `reuniao_participante`, porque é lá que a relação real vive.

---

## Integridade de contexto

```
✓ candidatura + projeto de cadeias diferentes: BLOQUEADO
```

Trigger `trg_reuniao_validar_contexto`. Quando ambos vêm preenchidos, valida
pela relação real `candidatura → frente_oportunidade → projeto`.

Validação **proporcional**: só age quando os dois existem. Contexto ausente
nunca é tratado como erro.

---

## Zero efeito operacional

```
meetings_created   = 5

candidaturas       = 0
projetos           = 0
parcerias          = 0
movimentacoes      = 0
```

Cinco reuniões criadas em quatro contextos diferentes, **nenhuma criou nada**.

---

## Preservação de histórico

`ON DELETE SET NULL` em `candidatura_parceiro_id` e `projeto_id`:

```
oportunidade descartada  →  DELETE
reunião                  →  SOBREVIVE, contexto vira null
```

A conversa aconteceu de verdade. Apagar o contexto que a motivou não pode
apagar o registro dela. Coberto por teste.

---

## Status de reunião

`planejada` · `realizada` · `cancelada`

**Não existe estado "aprovada".** A auditoria não encontrou Human Gate de
reunião no domínio — a tabela não tinha nem coluna de status. Inventar uma
aprovação aqui criaria regra de negócio que ninguém pediu.

Tentar gravar `status='aprovada'` é rejeitado por `ck_reuniao_status`.

---

## Perguntas de validação

| # | Pergunta | Resposta |
|--:|---|---|
| 1 | Reunião exige parceria? | **Não** |
| 2 | Reunião exige projeto? | **Não** |
| 3 | Reunião pré-oportunidade funciona? | Sim — contexto 1 |
| 4 | Reunião de oportunidade funciona? | Sim — contexto 2 |
| 5 | Reuniões legadas continuam válidas? | Sim — contexto 4 |
| 6 | Múltiplas Partes? | Sim — 3 Partes + 1 Cross |
| 7 | Parte ≠ usuário interno? | Sim — CHECK do banco |
| 8 | Consultas para AI-08 existem? | Sim — Parte, oportunidade, projeto |
| 9 | Contexto inconsistente é aceito? | Não — trigger bloqueia |
| 10 | Criar reunião cria algo operacional? | **Não** — todos os deltas em 0 |

---

## Pendência mantida em aberto

```
OPPORTUNITY_TO_PROJECT_TRIGGER = BUSINESS_DECISION_PENDING
```

Qual evento operacional converte Oportunidade em Projeto continua **não
definido**. Nada nesta Sprint tomou essa decisão: criação de reunião não é
gatilho, aprovação de reunião não existe, e Score Card não foi tocado.

---

## Limitações

1. **Sem rota HTTP nova** — a criação com contexto flexível existe no
   service/repository; expor endpoint fica para a etapa de frontend.
2. **Banco de teste vazio** — 0 reuniões pré-existentes, então a migração de
   dados históricos não pôde ser medida com volume real. A migration é aditiva
   e `DROP NOT NULL` não afeta linhas existentes, mas isso precisa ser
   confirmado contra staging antes de produção.
3. **Sem Human Gate de reunião** — não existia; não foi criado.
4. **Frontend não adaptado** — `ParceriaDetalhe.tsx` consome a rota legada, que
   continua funcionando.
