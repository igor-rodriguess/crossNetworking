# Plataforma Crossnetworking

> Aplicação web para centralizar o fluxo comercial da Cross e transformar o **Cross Score Card** de uma planilha manual em uma ferramenta de decisão, viva e apresentável.

---

## Visão geral

A **Plataforma Cross** é uma aplicação web interna que unifica, em um único lugar, todo o processo comercial da Cross, da definição do plano de um cliente à execução de uma parceria. No centro está o **Cross Score Card**, a metodologia proprietária que avalia, de forma quantitativa, o encaixe entre um cliente e potenciais marcas parceiras.

O objetivo não é "digitalizar planilhas", e sim reformular o Score Card: torná-lo padronizado, calculado automaticamente, comparável entre clientes e pronto para ser apresentado ao cliente final.

## Contexto e justificativa

Hoje a metodologia da Cross vive espalhada em múltiplas planilhas, uma por cliente e por etapa. A análise das planilhas reais em uso evidencia quatro problemas concretos:

1. **Fluxo fragmentado.** A avaliação de marcas, o funil de prospecção, os reports e os cronogramas estão em arquivos separados que não se comunicam — cada um mantido à mão.
2. **Cada cliente tem um "dialeto".** Os mesmos conceitos aparecem com nomes e estruturas diferentes em cada planilha (território/setor em um, segmento/prioridade em outro, verticais no Score Card).
3. **Status inconsistentes.** O estado de cada negociação é registrado em texto livre ("frente ativa", "abrir frente", "stand by", "declinado"...), sem uma régua comum.
4. **Score Card como cobrança, não como ferramenta.** O preenchimento é manual e célula a célula, o cálculo depende de fórmulas frágeis e não há uma saída visual para o cliente.

O resultado é um processo que consome o tempo do time de negócios, é difícil de auditar, depende de conhecimento individual e não escala. É esse conjunto de dores que a aplicação resolve.

## Objetivos

**Objetivo geral:** centralizar o fluxo comercial da Cross em uma aplicação web única, com o Cross Score Card reformulado como núcleo.

**Objetivos específicos:**

- Padronizar e automatizar o cálculo do Score Card, eliminando o preenchimento manual propenso a erro.
- Unificar as planilhas dispersas em uma base de dados canônica, mantendo a especificação própria de cada cliente.
- Padronizar o funil de prospecção com uma régua única de status.
- Gerar um resumo do Score Card visualmente apresentável, pronto para envio ao cliente.
- Preparar a base para uma camada de automação por IA, sem que o cálculo dependa dela.

## Público-alvo

- **Time comercial da Cross** — usuário principal: cadastra marcas, avalia no Score Card, gerencia o funil e o cronograma.
- **Gestão** — acompanha ranking, status e desempenho por cliente.
- **Cliente final da Cross** — destinatário do resumo apresentável gerado pela plataforma (não opera o sistema).

## Escopo da aplicação

### Escopo funcional (o que a aplicação faz)

| Módulo | O que faz |
| --- | --- |
| **Workspace** | Configuração de cada cliente: seus critérios, pesos, planilhas importadas e template de resumo. É onde a "especificação por cliente" é definida. |
| **Plano** | Define os objetivos do cliente e a matriz de critérios/pesos que rege o Score Card daquele cliente. |
| **Marcas** | Base centralizada de marcas e parceiros, compartilhada entre clientes e alimentada pelas planilhas importadas. |
| **Cross Score Card** | Avalia cada marca respondendo aos critérios do cliente; calcula o score de forma automática e em tempo real. |
| **Ranking** | Ordena as marcas por score automaticamente, com filtros por vertical/segmento. |
| **Prospecção** | Funil comercial com régua de status padronizada, prioridade, contato e histórico de negociação. |
| **Parceria** | Cronograma de execução das parcerias fechadas: ações, responsáveis e linha do tempo. |
| **Resumo ao cliente** | Gera um documento apresentável (score, matriz de critérios e racional estratégico) na identidade do cliente, exportável. |

### Fora de escopo (o que a aplicação não faz)

Para manter o foco e a entrega viável, ficam de fora nesta versão:

- Integração com CRMs de terceiros, e-mail ou ferramentas externas.
- Automação de disparos (mensagens, follow-ups automáticos de prospecção).
- Gestão financeira, faturamento ou contratos.
- Portal de acesso para o cliente final — o cliente recebe o resumo exportado, não opera o sistema.
- A camada de agentes de IA na primeira entrega: o produto é totalmente funcional sem IA, que entra como evolução posterior.

## Fluxo da aplicação

A plataforma organiza uma jornada linear, em que cada etapa alimenta a seguinte:

```
Plano do cliente → Marcas → Cross Score Card → Ranking → Prospecção → Parceria
                                     │
                                     └──→ Resumo ao cliente (exportável)
```

Configura-se o plano (critérios e pesos); cadastram-se as marcas; cada marca é avaliada no Score Card; o ranking se reordena; as marcas aprovadas descem para o funil de prospecção; as que fecham entram no cronograma de execução; e, a qualquer momento, gera-se o resumo apresentável de uma oportunidade.

## Regras de negócio

**Cálculo do Score Card (determinístico e auditável):**

```
Score = Σ (critério = SIM ? peso_SIM : NÃO ? peso_NÃO : 0) + potencial disruptivo (1 a 5)
```

Cada critério tem um peso quando atendido (SIM) e outro quando não atendido (NÃO). Um critério **em branco** (ainda não avaliado) soma **0** — não avaliar nunca penaliza o cliente. O potencial disruptivo é uma nota de 1 a 5 para parcerias fora da caixa. O cálculo é uma conta explicável: nunca uma caixa-preta.

**Especificação por cliente:** cada cliente define seus próprios critérios e pesos. Como os critérios são dados (não colunas fixas), clientes com metodologias diferentes convivem na mesma base sem alterar a estrutura.

**Régua de status do funil (padronizada):**

```
A abrir → Frente aberta → Em negociação → Fechada → Em execução
        (+ estados fora do funil ativo: Stand by, Declinada)
```

**Papel da IA (evolução):** os agentes apenas sugerem respostas e racionais; toda sugestão passa por validação humana antes de virar resultado final, e o score sempre vem da fórmula.

## Dados gerenciados

A aplicação mantém uma base canônica com: clientes e suas configurações, critérios e pesos por cliente, marcas (compartilhadas), avaliações (cliente × marca) e suas respostas, histórico de prospecção, parcerias e cronogramas, fontes de dados (planilhas importadas) e os racionais gerados para o cliente.

## Arquitetura (visão de alto nível)

Aplicação web em três camadas conceituais: uma **base de dados** canônica com configuração por cliente; uma **camada de aplicação** que centraliza o fluxo e roda o cálculo determinístico do Score Card; e uma **camada de automação por IA** (evolução) que assiste o preenchimento e a geração de racionais, sempre com validação humana.

**Tecnologias:** React, Node.js, PostgreSQL e, na evolução, Python/LangGraph.

## Roadmap

- **Fundação de dados** — base canônica e Score Card com cálculo automático.
- **Fluxo operacional** — Plano, Marcas, Score Card, Ranking, Prospecção e Parceria na interface.
- **Ingestão de planilhas** — importação das fontes existentes para o modelo.
- **Resumo ao cliente** — geração e exportação do documento apresentável.
- **Multi-cliente** — configuração dinâmica de novos clientes.
- **Automação por IA** — preenchimento assistido, enriquecimento e racional automático.

## Status

Em desenvolvimento.

## Autor

Desenvolvido por **Igor Rodrigues** como projeto de desenvolvimento na Cross.

---

*Projeto interno. O Cross Score Card é uma metodologia proprietária da Cross.*. 
