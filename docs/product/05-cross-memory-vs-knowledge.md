# 05 — Cross Memory vs. Cross Knowledge vs. Evidence

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

> Resolve formalmente a dúvida levantada em `docs/ai/04-rag-cross-knowledge-audit.md`.
> Nada implementado; o RAG **não foi alterado**.

---

## 1. Três contextos distintos

A confusão que a auditoria de IA encontrou vem de tratar como uma coisa só o que
são **três coisas com naturezas diferentes**:

| | **EVIDENCE** | **CROSS MEMORY** | **CROSS KNOWLEDGE** |
|---|---|---|---|
| Responde | *O que sabemos sobre o mundo?* | *O que aconteceu na Cross?* | *Como a Cross interpreta isso?* |
| Natureza | Factual, externa | Operacional, histórica | Metodológica, validada |
| Origem | Web, imprensa, releases | Reuniões, execuções, decisões | Papers, playbooks, aprendizados |
| Validação | Verificação por corroboração | Nenhuma — é registro | **Human Gate obrigatório** |
| Pode estar errada? | Sim — por isso tem `verification_status` | Sim — registra o que houve, inclusive erro | **Não** — se está aqui, foi aprovada |
| Versionada? | Não — é fato datado | Não — é histórico | **Sim** — metodologia evolui |
| Uso no reasoning | *"A marca X fez Y"* | Contexto e recuperação | *"Para a Cross, Y importa quando Z"* |

---

## 2. Exemplo concreto

Retomando o exemplo da §16 do briefing:

**EVIDENCE**
> "Empresa X lançou campanha no território Y."
> Fonte: `site-oficial.com/release` · publicado 2026-07-15 · coletado 2026-08-01
> · verificação: `corroborada` (3 domínios independentes)

**CROSS MEMORY**
> "Em 12/06/2026, reunião com a Empresa X. Demonstraram interesse em ativações
> no território Y. Responsável: fulano."
> Origem: reunião · não validada como conhecimento

**CROSS KNOWLEDGE**
> "Para a metodologia Cross, presença no território Y é relevante quando
> combinada com ativo de mídia própria. Territórios sem ativo raramente
> sustentam contrapartida."
> Origem: Paper v3 · validado em 2026-05-10 · aprovado por sicrano

O Crossability Reasoning usa **os três**, mas precisa **preservar a origem de
cada um**. Uma conclusão que misture "a empresa fez Y" (fato) com "para a Cross,
Y importa" (critério) sem distinguir a fonte é uma conclusão não auditável.

---

## 3. Regra fundamental do RAG (§16)

> **O RAG não serve como evidência de que um fato externo aconteceu.**

Isto resolve a tensão registrada na auditoria de IA. O comentário no código
([agentes.service.ts:2020](backend/src/modules/agentes/agentes.service.ts#L2020))
diz que o `partner_discovery` ignora o RAG porque *"a Base Cross não participa da
descoberta nem do fit"*. A decisão de **não usar o RAG como prova de existência**
estava certa; o erro foi concluir que ele não deveria participar de nada.

**A separação correta:**

| Uso do RAG | Permitido? |
|---|---|
| Provar que a marca X existe ou fez algo | ❌ **Nunca** — isso é Evidence |
| Informar como a Cross julga um fit | ✅ **Sim** — é o propósito |
| Recuperar critérios da metodologia | ✅ Sim |
| Recuperar cases e padrões | ✅ Sim |
| Substituir busca externa | ❌ Nunca |

**Conclusão:** o `partner_discovery` deve **passar a consultar o RAG**, mas
apenas para recuperar **critérios de julgamento** — nunca para fundamentar a
existência de uma candidata. A candidata continua vindo exclusivamente de
evidência externa verificável.

Isto será implementado na etapa de RAG, não agora.

---

## 4. Proveniência (§17)

### Estruturas conceituais

```
Evidence                          KnowledgeReference
├── claim                         ├── knowledge_id
├── source                        ├── document
├── source_url                    ├── section
├── published_at                  ├── methodology_version
├── collected_at                  └── relevance
├── confidence
└── verification_status
```

### O que já existe

| Campo de Evidence | Onde está hoje | Situação |
|---|---|---|
| `claim` | afirmações derivadas (hardening §6) | **PARCIAL** — existe em execução, não persistido como entidade |
| `source` | `ResultadoBusca.fonte` | ✅ |
| `source_url` | `ResultadoBusca.url` | ✅ |
| `published_at` | `ResultadoBusca.publicado_em` | ✅ **adicionado no hardening** |
| `collected_at` | `ResultadoBusca.coletado_em` | ✅ **adicionado no hardening** |
| `confidence` | `perfil.confianca`, `analise.confianca` | **PARCIAL** — no perfil, não no fato |
| `verification_status` | saída do `fact_verifier` | ✅ **integrado no hardening** |

**Seis dos sete campos já existem** — três deles entregues no hardening. O que
falta é **persistir Evidence como entidade**, não os campos.

| Campo de KnowledgeReference | Onde está hoje | Situação |
|---|---|---|
| `knowledge_id` | `documento_rag.id` | ✅ |
| `document` | `documento_rag.metadados` | **PARCIAL** |
| `section` | — | ❌ (não há chunking — auditoria §2) |
| `methodology_version` | — | ❌ |
| `relevance` | `similaridade` do retrieval | ✅ (não persistido) |

### Avaliação: as estruturas atuais suportam parcialmente

`cross_ai.documento_rag` tem `origem`, `metadados` (JSONB), `referencia_id` e
`embedding_origem`. Os campos ausentes (`section`, `methodology_version`) cabem
em `metadados` **sem migration** — o JSONB já está lá.

**Recomendação:** não criar tabelas novas para KnowledgeReference agora. Usar
`metadados` e avaliar promoção a colunas quando o volume justificar.

Para Evidence, a decisão é diferente: **persistir Evidence como entidade é
necessário**, porque hoje as afirmações verificadas existem apenas dentro do
JSONB de uma execução, sem poder ser consultadas, contestadas ou reutilizadas.
Isso fica para a etapa de RAG/Evidence.

---

## 5. Fluxo Memory → Knowledge (§15)

```
   CROSS MEMORY (tudo o que aconteceu)
   reuniões · execuções · decisões · análises · edições humanas
                        │
                        │  extração (agente propõe)
                        ▼
           PROPOSTA DE CONHECIMENTO
           "isto parece ser um padrão que a Cross aplica"
                        │
                        ▼
              ═══ HUMAN GATE ═══
              humano aprova · edita · rejeita
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        APROVADO              REJEITADO
              │                   │
              ▼                   ▼
   CROSS KNOWLEDGE          permanece em Memory
   (versionado, indexado)   (é aprendizado, não perda)
```

**Regra (ADR-010):** informação operacional **não vira** Cross Knowledge
automaticamente. Uma reunião registrada é Memory. Um padrão extraído de dez
reuniões só vira Knowledge após aprovação humana explícita.

**Por que a regra importa:** sem ela, o RAG acumularia observações não validadas
e passaria a ensinar à IA padrões que a Cross nunca endossou. O risco não é
técnico — é de credibilidade diante do cliente.

---

## 6. Onde cada coisa vive hoje

| Contexto | Estruturas atuais | Situação |
|---|---|---|
| **Evidence** | `oportunidade_ia.fontes`, `cross_governance.*`, saída do `fact_verifier` | **DISPERSO** — sem entidade própria |
| **Cross Memory** | `execucao_agente`, `tarefa_pipeline`, `historico_candidatura`, `documento`, `reuniao`, `auditoria` | **EXISTE DISPERSO** — é o conjunto, não uma tabela |
| **Cross Knowledge** | `documento_rag` | **INSUFICIENTE** — sem validação, versão, chunking nem metodologia indexada |

**Observação importante:** Cross Memory **não precisa de tabela nova**. É um
conceito guarda-chuva sobre estruturas que já existem. Criar uma tabela
"cross_memory" duplicaria dado.

Cross Knowledge, sim, precisa evoluir — mas dentro de `documento_rag`, com
colunas de validação e versão, não em estrutura nova.

---

## 7. O que muda no RAG (etapa seguinte, não agora)

Registrado para a próxima sprint:

| # | Mudança | Tipo |
|---|---|---|
| 1 | Chunking com tamanho e sobreposição | Código |
| 2 | `documento_rag.validado_por_id` + `validado_em` | Migration aditiva |
| 3 | `documento_rag.versao_metodologia` | Migration aditiva |
| 4 | Ingestão da metodologia (Papers validados) | Rotina |
| 5 | Sincronização ao validar Paper | Código |
| 6 | RAG no `partner_discovery` **como critério** | Código |
| 7 | Rastreio conclusão → trecho | Migration + código |
| 8 | Filtro por cliente no retrieval | Código |

**Nada disso nesta sprint.** A §8 do briefing é explícita: o RAG será tratado na
próxima etapa.

---

## 8. Human Gate — mapa transversal (§21)

| Ação | Automático? | Human Gate |
|---|---|---|
| IA cria rascunho de oportunidade | ✅ Automático | Não |
| IA analisa e pontua | ✅ Automático | Não |
| Oportunidade vira candidatura de domínio | ❌ | **SIM** |
| Meeting Intelligence extrai fatos | ✅ Automático (rascunho) | Não |
| Fatos de reunião atualizam Entity Intelligence | ❌ | **SIM** |
| IA propõe Score Card | ✅ Automático (proposta) | Não |
| Score Card vira avaliação oficial | ❌ | **SIM** (RN022) |
| IA sugere mudança de funil | ✅ Sugestão | Não |
| Funil se move (a partir de `recomendada`) | ❌ | **SIM** |
| Memory vira Knowledge | ❌ | **SIM** |
| Oportunidade vira Projeto | ❌ | **SIM** |
| Parceria é criada | ❌ | **SIM** (RN026) |

### Nunca automático, em nenhuma hipótese

- Escrita em `cross_core.parte` a partir de inferência de IA
- Alteração de Score Card já validado (RN022/RN023)
- Movimentação de funil a partir de `recomendada`
- Promoção de Memory a Knowledge
- Criação de parceria
- Qualquer escrita em `cross_governance.auditoria` (imutável por construção)

### Ponto a auditar

`part-enrichment.agent` **escreve em Entity Intelligence** e não passa por
`decidirHumanGate()` — registrado na auditoria de IA (doc 02 §11) e ainda não
resolvido. Pela tabela acima, deveria exigir validação humana.

**Ação recomendada:** auditar o caminho de escrita desse agente antes de ligar
chave real.
