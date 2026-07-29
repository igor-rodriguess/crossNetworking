# Documentação de runtime dos agentes

Esta pasta é a fonte única de verdade operacional para contexto e ferramentas dos agentes. Ela reduz a necessidade de enviar a arquitetura completa em cada chamada e separa regras globais, registro de ferramentas e dados específicos da execução.

## Arquivos

- `AGENT_RUNTIME_CONTEXT.md`: regras globais, política de contexto, evidências, limites, segurança, Crossability e Human Gate. Deve ser carregado nos prompts de todos os agentes, preferencialmente compactado.
- `TOOL_REGISTRY.yaml`: registro legível por máquina das ferramentas implementadas, planejadas ou não verificadas. Deve ser lido pelo backend/orquestrador.
- `README.md`: instruções de manutenção.

## Política de carregamento

Todos os agentes recebem `AGENT_RUNTIME_CONTEXT.md`, preferencialmente em versão compactada.

Cada agente recebe somente sua especificação individual, seu schema executável e as ferramentas autorizadas no registro.

Por execução, enviar somente dados atuais, evidências selecionadas, chunks recuperados, limites da tarefa e identificadores da execução/domínio.

O backend lê `TOOL_REGISTRY.yaml` como configuração de descoberta; ele não substitui os schemas TypeScript. Nenhum valor real de segredo deve aparecer nos arquivos.

## Como registrar uma ferramenta

1. Adicione uma chave estável em `TOOL_REGISTRY.yaml`.
2. Informe categoria, `status`, prioridade, objetivo, pacote/serviço e configuração confirmada.
3. Liste somente nomes de variáveis de ambiente existentes no código ou em `.env.example`.
4. Defina agentes autorizados, limites, timeout, retries, fallback, restrições, dados produzidos, dados persistidos e riscos.
5. Use `implemented` somente quando houver código, configuração ou migration confirmados.
6. Use `planned` quando a ferramenta estiver prevista, mas sem implementação.
7. Use `unverified` quando houver sinais parciais ou integração que não pôde ser confirmada de ponta a ponta.
8. Nunca registre chaves, tokens, senhas ou valores privados.

## Como registrar um novo agente

1. Crie/atualize o módulo e o schema executável no backend.
2. Registre rota e permissões somente se existirem no código.
3. Defina entrada, saída, versão, limites, evidências e política de falha.
4. Declare as ferramentas autorizadas no `TOOL_REGISTRY.yaml`.
5. Garanta auditoria e mantenha a saída como rascunho até o Human Gate.
6. Atualize o contexto somente para regras globais; não coloque dados específicos do agente nele.
7. Adicione testes do agente e smoke test do encadeamento relevante.

## Estados de implementação

- `implemented`: confirmado por código, schemas, configurações ou migrations.
- `planned`: previsto na arquitetura ou desenho futuro, mas ainda não implementado.
- `unverified`: implementação parcial ou disponibilidade ponta a ponta não confirmada.

Esses estados descrevem o repositório na data registrada no YAML. Não significam que uma chave externa esteja disponível ou que o provedor esteja saudável.

## Versionamento e alinhamento

Ao alterar contratos, limites ou ferramentas:

- atualize `metadata.last_reviewed` no YAML;
- incremente `version` quando houver mudança incompatível no registro;
- registre a versão do agente nas saídas/auditoria quando o contrato suportar;
- atualize o schema TypeScript antes da documentação;
- não copie `ARQUITETURA_AGENTES_IA.md` para cada prompt.

## Validação recomendada

No backend:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Valide o YAML com um parser YAML disponível no ambiente. Não adicione dependência de produção apenas para validar documentação.

Para conferir alinhamento:

- compare ferramentas do YAML com imports e endpoints em `backend/src/modules/agentes`;
- compare variáveis com `backend/src/config/env.ts` e `backend/.env.example`;
- compare tabela e origens RAG com `backend/database/migrations/035_rag_embeddings.sql`;
- compare permissões com `backend/src/modules/agentes/agentes.routes.ts`;
- execute smoke test sem imprimir segredos;
- revise ocorrências `planned` e `unverified` antes de declarar uma integração pronta.

## Lacunas conhecidas

SearXNG, pacote DDGS, Trafilatura, BeautifulSoup, Crawl4AI, cache de coleta, reranker, filas, storage dedicado e memória específica de decisões não foram confirmados como implementados. Firecrawl, LLM, DuckDuckGo customizado, embeddings, RAG, auditoria e observabilidade possuem código; os pipelines agora consultam o RAG de forma integrada, mas a base precisa ser alimentada e os provedores externos precisam ser validados operacionalmente antes de serem tratados como disponibilidade de produção.

Estado corrigido nesta consolidação: import do Collector ajustado, parsing de booleanos do ambiente corrigido, descrição OpenAPI alinhada ao DuckDuckGo, RAG integrado ao contexto do Reasoning e Ollama/LangGraph adicionados como execução local. A central `/oportunidades` do frontend consome a API de oportunidades, dispara uma rodada de descoberta e apresenta somente rascunhos persistidos; a promoção ao domínio permanece protegida pelo Human Gate.
