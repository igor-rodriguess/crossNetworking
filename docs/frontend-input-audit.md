# Auditoria de entrada e edição — Plataforma Cross

Data: 28/07/2026

## Resultado da leitura do frontend

As telas que já conversam com a API possuem persistência para o núcleo operacional:

| Área | Entrada/edição persistida |
| --- | --- |
| Relacionamentos | Criar, editar nome/categoria, arquivar, papéis e contatos |
| Clientes | Criar pelo seletor global; vínculo comercial e contratos no backend |
| Projetos | Criar, alterar nome/objetivo/produto/status, arquivar; briefings, planejamentos e responsáveis têm endpoints próprios |
| Funil e parcerias | Candidaturas, movimentações e parceria formalizada usam API |
| Usuários | Cadastro, pessoa/perfil e ativação usam API |
| Oportunidades IA | Geração e leitura de rascunhos persistidos |

Também foram encontrados módulos cuja edição ainda é estado visual/local, e portanto **não deve ser apresentada como dado persistido**: Critérios e pesos, detalhes de Score Card, agenda/turnês/Big Moments, ativos/canais da Parte, papers e alguns itens de execução/resultados. O backend tem domínios para parte desses recursos, mas as telas ainda não estão conectadas a todos os contratos.

## Importação CSV entregue

A rota `/importar` agora oferece uma carga profissional e confirmável:

1. aceita arquivo ou texto CSV, com vírgula ou ponto-e-vírgula;
2. permite escolher Marcas/Partes, Clientes Cross, Projetos, Frentes, Candidaturas, Ativos, Canais de mídia ou Perfis estratégicos;
3. envia apenas cabeçalhos e amostra ao agente `csv_mapping` (Ollama);
4. mostra e permite corrigir visualmente o mapeamento, sem reutilizar uma coluna duas vezes;
5. só grava após confirmação explícita;
6. valida cada linha no backend e devolve sucesso/erro por número de linha;
7. evita Partes duplicadas por nome e resolve cliente, projeto, frente e Parte pelos nomes para preservar os vínculos reais;
8. registra a sugestão do agente em `cross_ai.execucao_agente`.

Para cargas de grande volume, o limite atual é 1.000 linhas por confirmação. Para arquivos maiores, divida o CSV em lotes até que seja adicionada uma fila/worker de importação.

## Relatórios para a IA

A rota `/conhecimento` recebe PDFs com camada de texto, TXT, MD e CSV, extrai o texto no navegador e pede confirmação antes de indexar os trechos na base RAG. O relatório não é guardado como binário pela plataforma nesta etapa; ficam apenas os trechos vetoriais e os metadados de origem. A própria tela permite consultar a base para validar a ingestão antes de gerar oportunidades.

## Próxima rodada recomendada

Conectar as telas ainda locais começando por Critérios/Score Card e Artistas/agenda, incluindo os respectivos contratos e auditoria. Isso preserva a mesma regra da importação: nenhum campo deve parecer salvo se não tiver sido persistido.
