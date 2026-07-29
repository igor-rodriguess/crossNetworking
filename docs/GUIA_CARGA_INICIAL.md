# Carga inicial da base Cross

Este é o fluxo para começar a construir a base operacional ainda hoje, sem lançar dados diretamente no banco.

## 1. Clientes que buscam parceria

Abra **Importar dados com IA** e selecione **Clientes Cross**. Use o modelo baixado pela própria tela ou uma planilha com:

```csv
nome,segmento,site,inicio_relacionamento,observacoes
Marca Cliente,Varejo & Consumo,https://exemplo.com,01/07/2026,Objetivo de crescimento nacional
```

O cliente é criado como organização e também recebe o vínculo comercial da Cross.

## 2. Marcas, parceiros e talentos

Na mesma tela, selecione **Marcas, parceiros e talentos**. Um modelo recomendado é:

```csv
nome,tipo,categoria,papel,site,contato_nome,contato_cargo,contato_email,contato_telefone
Marca Parceira,organizacao,Bebidas & Lifestyle,parceiro,https://exemplo.com,Ana Silva,Marketing,ana@exemplo.com,+55 11 99999-9999
```

Valores úteis para `papel`: `parceiro`, `patrocinador`, `artista`, `atleta`, `veiculo_midia` e `cliente`. `parceiro_potencial` também é aceito e normalizado para parceiro.

Use **Sugerir com IA**, confira o mapeamento de cada coluna e confirme. Linhas com falha retornam com o número e a causa; as demais são criadas normalmente.

## 3. Relatórios que dão contexto à IA

Abra **Relatórios & base RAG** na navegação de Inteligência Cross. Envie um PDF com camada de texto, TXT, MD ou CSV — ou cole o texto do material.

1. confira o texto extraído e informe um título claro;
2. clique em **Adicionar à base de IA**;
3. faça uma consulta na própria tela usando termos do relatório;
4. só depois gere oportunidades de parceria.

O arquivo é processado no navegador e não é armazenado como binário nesta etapa. A base guarda os trechos indexados, o título e os metadados necessários para rastreabilidade. PDF escaneado precisa passar por OCR antes da carga.

## Dados operacionais da plataforma

Depois da base de marcas, a mesma tela importa os dados que colocam a operação em funcionamento:

- **Frentes de oportunidade:** localiza cliente e projeto pelo nome e cria a frente.
- **Candidaturas no funil:** localiza cliente, projeto, frente e marca pelo nome; cria a candidatura no funil.
- **Ativos estratégicos:** vincula propriedades e ativos a uma marca, parceiro ou talento.
- **Canais de mídia:** vincula Instagram, YouTube, TikTok, site e outros canais às Partes.
- **Perfis estratégicos:** registra resumo, posicionamento, objetivos e desafios de cada Parte.

Cada entidade possui um modelo CSV próprio na página. Os vínculos são resolvidos por nome exato para que a planilha não precise conter UUIDs.

## Ordem recomendada

1. Clientes Cross;
2. marcas/parceiros/talentos;
3. projetos ligados aos clientes;
4. frentes de oportunidade;
5. marcas no funil, ativos, canais e perfis estratégicos;
6. relatórios de mercado, públicos e estratégia;
7. oportunidades de IA.

Essa ordem garante que os agentes encontrem entidades e contexto real ao montar a análise Crossability.
