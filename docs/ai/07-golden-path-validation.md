# 07 — Validação do Golden Path

**Plataforma Cross** · Sprint 0B
Data: 07/08/2026

---

## Aviso metodológico — leia primeiro

**A execução dinâmica não foi possível nesta máquina.** O ambiente não tem
runtime Node disponível:

- `node` não está no PATH
- A instalação portátil em
  `%LOCALAPPDATA%\node-portable\node-v24.18.0-win-x64\` contém `npm`, `npx`,
  `corepack` e `node_modules`, **mas não contém `node.exe`**
- Não há Node em `C:\Program Files\nodejs`, `Program Files (x86)`, `fnm` ou
  `Volta`

Sem runtime, `npx vitest` não executa. E a suíte de integração exigiria ainda
`docker compose up -d db-test` + `TEST_DATABASE_URL` — a suíte se recusa a rodar
sem banco de teste, por proteção deliberada.

**O que este documento contém, portanto, é um _trace estático_:** o caminho
percorrido linha a linha no código, com os valores que o modo mock produz por
construção (os stubs são determinísticos, então a saída é previsível por
leitura). **Não é execução verificada.**

Onde afirmo um valor concreto, ele vem da leitura do stub correspondente. Onde
não pude determinar, digo explicitamente.

**Para executar de fato**, quando houver Node:

```bash
# 1. instalar Node 22+ e garantir node.exe no PATH
# 2. testes unitários dos agentes (sem banco, modo mock)
cd backend
$env:AI_MOCK="true"
npx vitest run src/modules/agentes

# 3. golden path completo (exige banco)
docker compose up -d db-test
npm run db:migrate:test
npm test
```

---

## 1. Input inicial do trace

Cenário escolhido — jornada A (Cliente → Parceiro), a mais madura:

```json
POST /agentes/partner-discovery/async
{
  "cliente": "Grupo Aramis",
  "objetivo": "Encontrar marcas parceiras para collabs de moda masculina",
  "limite_consultas": 4,
  "limite_resultados_por_consulta": 3,
  "limite_urls": 5,
  "limite_candidatos": 5
}
```

Configuração assumida: `AI_MOCK=true`, `AI_PROVIDER=ollama`, sem
`OPENAI_API_KEY`, sem `FIRECRAWL_API_KEY` — o estado atual do `.env.example`.

> **Nota sobre fixture:** não há fixture da Aramis no repositório. Os testes de
> agentes usam dados sintéticos inline. Os dados reais da Aramis estão no banco
> em operação, que esta auditoria não toca. O trace abaixo assume a base de
> teste vazia, exceto onde indicado.

---

## 2. Trace etapa a etapa

### Etapa 1 — Planning · `heuristica`

Chama `planejarDescobertaDeMercado()` (não `planejarPesquisa()`), pois
`pipeline === "partner_discovery"`.

- Consulta `repo.listarFrentesParaDescoberta(client, "Grupo Aramis", ...)`
- **Com base de teste vazia:** sem frentes → plano degrada para eixos genéricos
- **Com dados reais:** usaria as 18 frentes da conta

Persistido: `INSERT execucao_agente (agente='search_planning', origem='heuristica', tokens=0, duracao_ms=NULL)`
Progresso: peso da etapa.

### Etapa 2 — Collect · `mock`

`consultasLimitadas(plano, 4)` alterna entre eixos (não concentra no primeiro).

Com `AI_MOCK=true`, `buscar()` retorna `buscaMock()` — **3 resultados fixos por
consulta**, derivados do termo ([web-search.ts:36-60](backend/src/modules/agentes/shared/web-search.ts#L36-L60)):

| # | URL | Fonte |
|---|---|---|
| 1 | `https://exemplo-setorial.com/<slug>` | exemplo-setorial.com |
| 2 | `https://noticias-exemplo.com/2026/<slug>` | noticias-exemplo.com |
| 3 | `https://relatorios-exemplo.com/<slug>` | relatorios-exemplo.com |

Saída esperada: `total_consultas: 4`, `total_resultados: 12`.
Persistido: `execucao_agente (origem='mock')`.

### Etapa 3 — Credibility · `heuristica`

Aplicando a heurística aos domínios mock:

- base 50
- HTTPS: **+8** → 58
- domínio reputado: não (nenhum `exemplo-*` está na lista) → 58
- TLD institucional: não → 58
- padrão de baixa qualidade: não → 58
- **fonte de exemplo (mock): −10** → **48**

Resultado: score **48**, nível `media` para os 12 resultados.
Resumo esperado: `{ alta: 0, media: 12, baixa: 0 }`.

### ⚠ Porta de custo — o fluxo para aqui

```ts
const haFonteConfiavel = credibilidade.saida.avaliacoes.some((a) => a.score >= 70);
// 48 >= 70 → false
```

**`haFonteConfiavel = false`.**

Consequência ([linha 1972](backend/src/modules/agentes/agentes.service.ts#L1972)):

```ts
const extracao = coleta.saida.total_resultados && haFonteConfiavel
  ? ... 
  : { saida: { total_conteudos: 0, perfis: [] }, origem: "mock", fonteConteudo: undefined };
```

A extração **não roda**. Retorna zero perfis.

### Etapa 4 — Verification · `ignorada`

`input.afirmacoes` não foi fornecido → etapa marcada `ignorada` com observação
*"Nenhuma afirmação foi fornecida pelo chamador."*

### Etapa 5 — Extraction · `parcial`

Zero perfis. Observação registrada: *"Nenhuma fonte atingiu a credibilidade
mínima; extração e LLM foram poupados."*

### Etapa 6 — Entity Resolution · `ignorada`

`extracao.saida.perfis.length === 0` → *"Nenhum perfil foi extraído."*

### Etapa 6b — RAG · `ignorada`

Por decisão de pipeline: *"Partner Discovery usa exclusivamente evidências
externas verificáveis."*

### Etapa 7 — Crossability · `parcial`

`perfis` vazio → `analises = []`. Observação: *"Sem candidatos para analisar."*

### Etapa 8 — Recommendation · `ignorada`

*"A recomendação exige ao menos um candidato analisado."*

### Etapa 9 — Human Gate

**Não alcançada** — não há oportunidade para curar.

### Fecho

```
status: "insufficient_evidence"
observacoes: [
  "Pipeline partner_discovery executado em Nms.",
  "Toda análise permanece como rascunho até o Human Gate.",
  "Não houve evidência suficiente para gerar recomendação."
]
```

`persistirOportunidades()` recebe `analises: []` → **zero `oportunidade_ia`**.

---

## 3. Conclusão do trace: o modo mock não percorre o golden path

**Resultado esperado do fluxo em modo mock puro: `insufficient_evidence` na
etapa 3.**

A causa é uma **interação entre duas decisões corretas**:

1. A credibilidade penaliza fontes `exemplo` em −10 para que mock não passe por
   evidência real — **proteção deliberada e desejável**
2. A extração exige score ≥70 para poupar LLM — **porta de custo desejável**

Juntas, elas garantem que **o modo mock nunca produza oportunidades**. Isso é
provavelmente intencional (impedir que dado sintético vire rascunho), e é uma
propriedade de segurança valiosa.

**Mas tem duas consequências:**

- **Não é possível exercitar o pipeline completo sem rede.** Testar Reasoning →
  Recommendation → Human Gate exige fontes reais com score ≥70, ou seja, rede
  ativa via DuckDuckGo.
- **O golden path não é testável em CI.** Não há teste de integração cobrindo o
  pipeline fim-a-fim; os testes existentes cobrem agentes isolados com dados
  sintéticos injetados diretamente.

### Caminho alternativo verificado no código

Com `AI_MOCK=false` (padrão) e rede disponível:

- DuckDuckGo real → domínios reais → alguns com score ≥70 (g1, exame, valor…)
- Extração roda com Ollama local
- Crossability roda em `heuristica`
- Recommendation ordena
- Oportunidades são persistidas

**Este é o caminho que funciona hoje** — e depende de rede, não de chave paga.

---

## 4. Dados que seriam persistidos (execução completa)

| Tabela | Registros |
|---|---|
| `execucao_agente` | 1 por etapa executada + 1 por candidato no reasoning + 1 pai |
| `tarefa_pipeline` | 1, atualizada a cada etapa |
| `oportunidade_ia` | 1 por candidata aprovada, `status='rascunho'` |
| `cross_governance.auditoria` | conforme gatilhos |

Em todas: `tokens_entrada=0`, `tokens_saida=0`, `duracao_ms=NULL` (ver `06` §2).

---

## 5. Erros e fragilidades encontrados no trace

| # | Achado | Gravidade |
|---|---|---|
| 1 | Modo mock não alcança Reasoning/Recommendation/Human Gate | **Média** — limita teste offline |
| 2 | Fact Verifier nunca executa | **Alta** |
| 3 | Tokens e duração sempre zerados no pipeline | **Alta** (antes de chave paga) |
| 4 | Sem teste de integração do pipeline completo | **Média** |
| 5 | Coleta depende de scraping de HTML do DuckDuckGo | **Alta** |
| 6 | Falha em qualquer etapa perde todo o trabalho anterior | **Média** (Alta com chave paga) |
| 7 | Não há fixture da Aramis para teste reproduzível | **Baixa** |

---

## 6. Onde o fluxo ainda não representa a nova visão

| Aspecto | Hoje | Visão Cross Intelligence |
|---|---|---|
| Metodologia Cross no julgamento | ausente (RAG desligado) | deveria ser o diferencial |
| Reasoning | heurística por template | raciocínio com metodologia |
| Entrada | só objetivo textual | três jornadas |
| Reuniões como fonte | inexistente | insumo central |
| Ciclo de aprendizado | descarte não retroalimenta | descarte informa |
| Rastreio afirmação→fonte | nível de oportunidade | nível de afirmação |

**Continua em:** `08-three-journeys-gap-analysis.md`.
