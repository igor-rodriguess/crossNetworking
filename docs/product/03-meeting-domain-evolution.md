# 03 — Evolução do Domínio de Reunião

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> **Nenhuma migration foi executada.** Este documento entrega a proposta completa
> — SQL, compatibilidade, rollback, impacto e testes — para decisão humana.

---

## 1. Estrutura atual

```sql
CREATE TABLE cross_execution.reuniao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parceria_id UUID NOT NULL,            -- ← O BLOQUEADOR
    titulo VARCHAR(200) NOT NULL,
    data_reuniao TIMESTAMPTZ NOT NULL,
    local VARCHAR(200),
    resumo TEXT,
    criado_em, criado_por_id, atualizado_em, atualizado_por_id,
    arquivado_em, arquivado_por_id,

    CONSTRAINT fk_reuniao_parceria
        FOREIGN KEY (parceria_id)
        REFERENCES cross_partnerships.parceria(id)
        ON DELETE RESTRICT
);

CREATE TABLE cross_execution.reuniao_participante (
    id UUID PRIMARY KEY,
    reuniao_id UUID NOT NULL,
    usuario_interno_id UUID,              -- interno
    parte_id UUID,                        -- ← JÁ EXISTE vínculo com Parte
    papel VARCHAR(100),
    CONSTRAINT ck_reuniao_participante_alvo
        CHECK ((usuario_interno_id IS NOT NULL AND parte_id IS NULL)
            OR (usuario_interno_id IS NULL AND parte_id IS NOT NULL))
);
```

### FKs atuais

| Tabela | Coluna | Referencia | Nulidade |
|---|---|---|---|
| `reuniao` | `parceria_id` | `cross_partnerships.parceria` | **NOT NULL** |
| `reuniao_participante` | `reuniao_id` | `reuniao` | NOT NULL |
| `reuniao_participante` | `usuario_interno_id` | `usuario_interno` | nullable |
| `reuniao_participante` | `parte_id` | `cross_core.parte` | nullable |

### Rotas atuais (6)

```
POST   /parcerias/:id/reunioes
GET    /parcerias/:id/reunioes
GET    /reunioes/:id
PATCH  /reunioes/:id
POST   /reunioes/:id/participantes
DELETE /reunioes/:id/participantes/:participanteId
```

---

## 2. Limitações

**Limitação 1 — Reunião exige parceria fechada.** `parceria_id NOT NULL` obriga
que exista uma parceria. Uma reunião com a Converse, que não é parceira de
ninguém, **não tem onde ser registrada**. Isso bloqueia integralmente a
jornada B.

**Limitação 2 — Cadeia de dependência longa.** Para registrar uma reunião hoje é
preciso: cliente → projeto → frente → candidatura → decisão aprovada → Paper
validado (RN026) → parceria. **Seis pré-requisitos** antes de anotar uma conversa.

**Limitação 3 — Schema semanticamente errado.** A reunião vive em
`cross_execution`, o schema da execução de parcerias fechadas. Conceitualmente,
uma reunião de prospecção é **evento de inteligência**, não de execução.

**Limitação 4 — Sem conteúdo estruturado.** Só há `resumo TEXT`. Não há campo
para transcrição, fatos extraídos ou vínculo com o que a reunião gerou. O
Meeting Intelligence precisará disso.

### O que **não** é limitação

**`reuniao_participante.parte_id` já existe.** A ligação reunião ↔ Parte já está
modelada — só não é obrigatória nem principal. Isso reduz bastante o tamanho da
migration: não é preciso criar o vínculo, e sim **promovê-lo a principal**.

---

## 3. Modelo desejado

```
REUNIÃO
  ├── parte_principal_id   OBRIGATÓRIA  (com quem foi a conversa)
  ├── oportunidade_id      opcional     (candidatura_parceiro)
  ├── projeto_id           opcional
  └── parceria_id          opcional     (era obrigatório)
```

Exemplo da §13 — reunião com a Converse:

| Campo | Valor |
|---|---|
| `parte_principal_id` | Converse |
| `oportunidade_id` | `NULL` — ainda não existe |
| `projeto_id` | `NULL` |
| `parceria_id` | `NULL` |

Depois: Meeting Intelligence extrai → Human Gate → atualiza Entity Intelligence
→ pode gerar Oportunidades.

---

## 4. Migration proposta (NÃO EXECUTAR)

> Numeração sugerida **055** — depois de 053 e 054, que aguardam aplicação.

```sql
-- =============================================================================
-- 055 – Reunião como evento de inteligência (proposta — não aplicada)
--
-- Motivação: `parceria_id NOT NULL` obriga parceria fechada para registrar
-- qualquer reunião, bloqueando a jornada Parceiro → Cliente. Uma conversa com
-- uma marca que ainda não é parceira não tem onde ser registrada.
--
-- ADITIVA e não destrutiva:
--   · nenhuma coluna removida ou renomeada;
--   · nenhum dado reescrito;
--   · `parceria_id` deixa de ser obrigatório, mas continua existindo e válido;
--   · reuniões atuais seguem intactas e continuam ligadas à sua parceria.
-- =============================================================================

-- 1) Parte principal: com quem foi a conversa.
ALTER TABLE cross_execution.reuniao
    ADD COLUMN IF NOT EXISTS parte_principal_id UUID,
    ADD COLUMN IF NOT EXISTS oportunidade_id UUID,
    ADD COLUMN IF NOT EXISTS projeto_id UUID,
    -- Natureza do encontro: separa prospecção de execução de parceria.
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'execucao'
        CHECK (tipo IN ('prospeccao', 'negociacao', 'execucao', 'acompanhamento')),
    -- Conteúdo bruto para o Meeting Intelligence. Continua sendo Cross Memory:
    -- não vira conhecimento nem fato de domínio sem Human Gate.
    ADD COLUMN IF NOT EXISTS transcricao TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reuniao_parte_principal') THEN
        ALTER TABLE cross_execution.reuniao
            ADD CONSTRAINT fk_reuniao_parte_principal
            FOREIGN KEY (parte_principal_id) REFERENCES cross_core.parte(id)
            ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reuniao_oportunidade') THEN
        ALTER TABLE cross_execution.reuniao
            ADD CONSTRAINT fk_reuniao_oportunidade
            FOREIGN KEY (oportunidade_id) REFERENCES cross_projects.candidatura_parceiro(id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reuniao_projeto') THEN
        ALTER TABLE cross_execution.reuniao
            ADD CONSTRAINT fk_reuniao_projeto
            FOREIGN KEY (projeto_id) REFERENCES cross_projects.projeto(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- 2) Retrocompatibilidade: deriva a parte principal das reuniões existentes,
--    a partir do parceiro da parceria. Só preenche o que está vazio.
UPDATE cross_execution.reuniao r
   SET parte_principal_id = p.parte_id
  FROM cross_partnerships.parceria p
 WHERE r.parceria_id = p.id
   AND r.parte_principal_id IS NULL;

-- 3) Só então relaxa a obrigatoriedade — com os dados antigos já preenchidos.
ALTER TABLE cross_execution.reuniao
    ALTER COLUMN parceria_id DROP NOT NULL;

-- 4) Integridade: toda reunião precisa de ao menos um vínculo. Impede reunião
--    solta, que seria pior do que a restrição original.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reuniao_vinculo_minimo') THEN
        ALTER TABLE cross_execution.reuniao
            ADD CONSTRAINT ck_reuniao_vinculo_minimo
            CHECK (parte_principal_id IS NOT NULL OR parceria_id IS NOT NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reuniao_parte_principal
    ON cross_execution.reuniao (parte_principal_id, data_reuniao DESC)
    WHERE parte_principal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reuniao_oportunidade
    ON cross_execution.reuniao (oportunidade_id)
    WHERE oportunidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reuniao_tipo
    ON cross_execution.reuniao (tipo, data_reuniao DESC);
```

> **Nota sobre o passo 2:** assume que `cross_partnerships.parceria` tem
> `parte_id` para o parceiro. **Verificar antes de aplicar** — se o nome da
> coluna for outro, ajustar o UPDATE.

---

## 5. Compatibilidade

| Aspecto | Situação |
|---|---|
| Colunas removidas/renomeadas | **Nenhuma** |
| Dados apagados | **Nenhum** |
| Reuniões existentes | Intactas; ganham `parte_principal_id` derivado |
| Rotas atuais (6) | **Continuam funcionando** — `parceria_id` segue válido |
| Código antigo | Funciona: só adiciona colunas nullable e relaxa restrição |
| `tipo` das reuniões antigas | `'execucao'` por default — leitura correta |
| Idempotente | Sim |
| Ordem de deploy | Migration **antes** do código, como 053/054 |

**Ponto de atenção:** `DROP NOT NULL` é o único passo não trivialmente
reversível. Depois de aplicado, reuniões sem parceria podem ser criadas; o
rollback exigiria tratá-las.

---

## 6. Rollback

```sql
-- Só é seguro enquanto NÃO houver reunião sem parceria.
-- Verificar primeiro:
--   SELECT count(*) FROM cross_execution.reuniao WHERE parceria_id IS NULL;
-- Se retornar > 0, decidir o destino dessas reuniões ANTES de reverter.

ALTER TABLE cross_execution.reuniao DROP CONSTRAINT IF EXISTS ck_reuniao_vinculo_minimo;
ALTER TABLE cross_execution.reuniao ALTER COLUMN parceria_id SET NOT NULL;  -- falha se houver NULL
ALTER TABLE cross_execution.reuniao
    DROP CONSTRAINT IF EXISTS fk_reuniao_parte_principal,
    DROP CONSTRAINT IF EXISTS fk_reuniao_oportunidade,
    DROP CONSTRAINT IF EXISTS fk_reuniao_projeto,
    DROP COLUMN IF EXISTS parte_principal_id,
    DROP COLUMN IF EXISTS oportunidade_id,
    DROP COLUMN IF EXISTS projeto_id,
    DROP COLUMN IF EXISTS tipo,
    DROP COLUMN IF EXISTS transcricao;
DROP INDEX IF EXISTS cross_execution.idx_reuniao_parte_principal;
DROP INDEX IF EXISTS cross_execution.idx_reuniao_oportunidade;
DROP INDEX IF EXISTS cross_execution.idx_reuniao_tipo;
```

**Rollback perde:** transcrições e vínculos com oportunidade/projeto criados no
período. **Não afeta:** reuniões originais, participantes, parcerias, execução.

---

## 7. Impacto nos dados existentes

Não foi possível contar as reuniões em produção (auditoria estática, sem tocar o
banco). Pela ausência de interface para o módulo `execucao` (Sprint 0A §3.4), a
expectativa é **zero ou muito poucas**.

**Verificar antes de aplicar:**

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE parceria_id IS NOT NULL) AS com_parceria
  FROM cross_execution.reuniao;
```

Se `total = 0`, o passo 2 (UPDATE) é inócuo e o risco é mínimo.

---

## 8. Testes necessários

**Antes de aplicar:**
1. Contagem acima
2. Confirmar o nome da coluna de parceiro em `cross_partnerships.parceria`
3. Aplicar em `db-test` primeiro: `npm run db:migrate:test`

**Depois de aplicar:**

| Teste | Critério |
|---|---|
| Suíte completa | **203 testes passam sem alteração nos testes** |
| `execucao.test.ts` | As 26 rotas continuam respondendo |
| Reunião só com parceria | Continua funcionando (retrocompat.) |
| Reunião só com parte | Passa a funcionar |
| Reunião sem nenhum vínculo | **Rejeitada** por `ck_reuniao_vinculo_minimo` |
| Reuniões antigas | Ganharam `parte_principal_id`; `tipo = 'execucao'` |
| Rollback em banco descartável | Executa sem erro |

**Novos testes a escrever:** criação com `parte_principal_id` sem parceria;
rejeição de reunião sem vínculo; derivação retroativa.

---

## 9. Impacto no backend (não implementar agora)

| Item | Mudança |
|---|---|
| Rotas atuais (6) | Nenhuma — continuam válidas |
| Rotas novas | `POST /partes/:id/reunioes`, `GET /partes/:id/reunioes` |
| Módulo | Considerar mover para `inteligencia` (schema segue em `cross_execution`) |
| Classificação Sprint 0A | Reunião sai de `DEPRECATE` e passa a **KEEP** |

> Mover as rotas de módulo é opcional e cosmético. A migration não depende disso.

---

## 10. Recomendação

**Aplicar a migration 055 logo após 053 e 054**, no mesmo ciclo de homologação.

Justificativa: é a **menor evolução possível** (5 colunas, 1 relaxamento, 3
índices), desbloqueia uma jornada inteira, não altera dado existente e o risco
é proporcional ao volume de reuniões — provavelmente zero.

**Continua em:** `04-dashboard-information-architecture.md`.
