# Plataforma Cross

> Plataforma web que centraliza o ciclo de vida completo de cada projeto da Cross — do briefing à entrega — unindo as duas metodologias proprietárias da casa: o **Crossability**, que encontra o parceiro ideal, e o **Cross Score Card**, que mede o encaixe da parceria.

![Node](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Monday](https://img.shields.io/badge/Integra%C3%A7%C3%A3o-Monday_API-FF3D57)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-7C5CFF)

---

## Visão geral

A **Plataforma Cross** é a fonte única e a memória de cada projeto da Cross. Ela reúne, em um só lugar, o que hoje vive fragmentado — o briefing, as respostas no Monday, a análise das metodologias e o acompanhamento — organizando tudo em torno de uma entidade central: o **Projeto**.

O ponto de entrada é o **briefing**. A partir dele, o projeto percorre um ciclo — briefing → kickoff → análise (Crossability + Cross Score Card) → parceria e cronograma → acompanhamento — e todo esse histórico fica registrado e conectado.

## Contexto e problema

O processo da Cross está espalhado por ferramentas e formatos que não conversam: o **briefing** e seus próximos passos vivem em documentos e no **Monday**; a **análise** é feita em planilhas de Score Card, uma por cliente e cada uma diferente; o **acompanhamento** acontece em outras planilhas. Não existe uma fonte única que conte a história completa de um projeto, e o conhecimento fica preso em quem mantém cada arquivo.

## Objetivos

- Centralizar o **histórico completo** de cada projeto, do briefing ao acompanhamento.
- Unir as duas metodologias — **Crossability** (encontrar o parceiro) e **Cross Score Card** (medir o encaixe) — que juntas geram o **paper**.
- **Integrar** o que já existe (Monday, via API) e **importar** o que está em planilhas.
- Adaptar-se a cada cliente e produto por **configuração**, não por reprogramação.

## As duas metodologias (o coração da plataforma)

O que torna a Cross única são suas duas metodologias, que se complementam: uma **descobre quem** deveria ser o parceiro, a outra **mede o quão bom** é esse parceiro.

### Crossability — encontrar o parceiro ideal

O Crossability é uma metodologia de **matchmaking entre empresas**. Todo cliente tem um perfil em três dimensões:

- **Ativos** — o que a marca tem para oferecer.
- **Objetivos** — o que a marca busca com a parceria.
- **Consumidores** — o público que ela alcança.

A partir desse perfil, o Crossability busca um **parceiro ideal** cujas três dimensões sejam compatíveis. Quando os perfis casam, acontece o **Cross** — a parceria. É uma análise de **compatibilidade de perfis**, e é exatamente aqui que um **agente de IA** agrega: varrer marcas e casar perfis nas três dimensões é o tipo de trabalho que a IA acelera, sempre com validação humana.

### Cross Score Card — medir o encaixe

Com os parceiros que o Crossability trouxe, o Cross Score Card faz a avaliação **quantitativa e determinística** do encaixe de cada um:

```
Score = Σ (critério = SIM ? peso_SIM : NÃO ? peso_NÃO : 0) + potencial disruptivo (1 a 5)
```

Auditável, nunca caixa-preta. Os critérios variam por **produto** (uma collab usa critérios de collab; um patrocínio, outros).

### Juntas, compõem o paper

O **Crossability sugere *quem*** e o **Score Card mede *quão bom***. A combinação das duas gera o **paper** — a proposta apresentável ao cliente.

## Escopo — o que a plataforma abrange

Etapa
O que faz

**Briefing** *(entrada)*
Registra a pauta, os próximos passos e os alinhamentos com o cliente. Início do histórico.

**Kickoff**
Marca o início efetivo do projeto.

**Análise — o "paper"**
Aplica o Crossability (encontrar o parceiro) e o Cross Score Card (medir o encaixe).

**Parceria & Cronograma**
Acompanha a execução da parceria fechada: ações, responsáveis e linha do tempo.

**Acompanhamento**
Mantém o histórico e o status do projeto ao longo da entrega.

### Fora de escopo

- Contato, negociação comercial e envio automático de propostas a clientes ou parceiros. A IA identifica e organiza oportunidades; a decisão e a abordagem continuam humanas.
- Envio efetivo do paper ao cliente (e-mail/mensageria externa).
- Financeiro contábil, faturamento e contratos.
- Operação da plataforma pelo cliente final.

## O Projeto como entidade central

Tudo se organiza ao redor de um **Projeto**, que guarda o histórico completo e conecta as etapas: briefing, kickoff, análises, paper, cronograma e acompanhamento. Saber "a situação do projeto X" passa a ser uma consulta a uma linha do tempo, não uma caça a arquivos.

## Especificação por cliente e produto

Cada cliente é analisado de forma diferente — e a variação vem principalmente do **tipo de produto** (collab, patrocínio, licenciamento...). A plataforma funciona em dois momentos: **configurar** o cliente/produto (perfil, critérios e análises) e depois **operar** sobre essa configuração. Uma única aplicação, ajustada por configuração.

## Integração com o Monday e passagem de dados

Trazer para dentro o que já existe é o maior desafio do projeto. A estratégia é dupla e gradual, para não obrigar o time a abandonar suas ferramentas de uma vez:

- **Integrar** o Monday via API, puxando as respostas do briefing e os status.
- **Importar** as planilhas existentes (Score Card, acompanhamento) para o modelo da plataforma.

## Papel da IA

Uma camada de automação que entra **por cima** de uma base que já funciona sem ela: planeja pesquisas externas, coleta fontes, avalia credibilidade, extrai evidências, resolve entidades, raciocina sobre Crossability, gera rascunhos de oportunidade e apoia o mapeamento de planilhas. O Cross Score Card permanece determinístico e toda sugestão passa por validação humana antes de virar recomendação ou parceria.

## Abordagem de entrega

O desenvolvimento tem prazo de **um mês**. A estratégia é entregar um **núcleo sólido e verdadeiro**, com o restante da visão modelado e pronto para plugar — em vez de tentar fazer tudo pela metade. A plataforma nasce com uma ou duas empresas (Animale já está na base) e cresce a partir daí.

Fase
O que entra

**Disponível agora**
Projeto navegável do briefing ao acompanhamento · Cross Score Card funcional · cadastro e edição de dados · importação assistida de CSV e funil histórico · RAG de documentos · oportunidades externas com evidências, racional e Human Gate.

**Próximas evoluções**
Integração com Monday · expansão da base de conhecimento · implantação do Ollama em servidor de rede · acompanhamento avançado e automações comerciais aprovadas por usuários.

## Tecnologias

React · Node.js + Express + TypeScript · PostgreSQL · Ollama local (`qwen3:4b`) · DuckDuckGo · Firecrawl. A orquestração atual é executada por pipelines e fila persistida em TypeScript; LangGraph é uma evolução prevista, não uma dependência em produção.

## Status

Pronto para demonstração local: banco, API, frontend, importação, RAG, Score Card e agentes estão conectados. A implantação em servidor e integrações externas de operação seguem como próxima etapa.

## Autor

Desenvolvido por **Igor Rodrigues** como projeto de desenvolvimento na Cross.

---

*Projeto interno. Crossability e Cross Score Card são metodologias proprietárias da Cross.*
