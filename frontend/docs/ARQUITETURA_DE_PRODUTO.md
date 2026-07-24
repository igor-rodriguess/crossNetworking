# Arquitetura de produto — Plataforma Cross

Este documento transforma os 51 requisitos funcionais da API em jornadas que
fazem sentido para quem trabalha com parcerias. O objetivo não é reproduzir as
202 rotas como itens de menu: é apresentar a pessoa certa com a próxima decisão
que precisa tomar.

## Jornada principal

```
Descobrir ──> Estruturar ──> Avaliar ──> Decidir ──> Executar ──> Medir
  Partes        Projetos       Crossability   Paper/      Plano,       ROI,
  inteligência  briefing       Score Card     aprovação   entregas     resultados
```

## Espaços de trabalho

| Espaço | Necessidade do usuário | RFs | Estado atual | Próxima entrega visual |
|---|---|---:|---|---|
| Operar hoje | Ver prioridades, pendências e próximos marcos | transversal | Dashboard existe | tornar ações e riscos mais evidentes |
| Descobrir | Conhecer partes, públicos, territórios, ativos e sinais | RF004–RF015 | Partes e detalhe existem | filtros por inteligência e linha do tempo de sinais |
| Estruturar | Transformar demanda em projeto, briefing e frentes | RF016–RF026 | Projetos, detalhes e funil existem | central de cliente/contrato e criação guiada |
| Avaliar & decidir | Comparar candidatos, justificar score, validar Paper e aprovar | RF027–RF033 | Crossability, Score Card, ranking e funil existem | decisão guiada e visibilidade de bloqueios RN022–RN025 |
| Executar & medir | Formalizar, entregar, acompanhar, medir e encerrar | RF034–RF047 | Cronograma e detalhe de parceria existem | visão de parceria única: contrato, plano, pendências, indicadores e ROI |
| Governar | Evidências, auditoria, importação e IA assistida | RF001–RF003, RF048–RF051 | ainda não possui telas dedicadas | administração, trilha e central de importações |

## Navegação proposta

1. **Operar hoje** — dashboard de prioridades.
2. **Descobrir** — relacionamentos e mapa de oportunidades.
3. **Estruturar** — projetos, briefings e funil.
4. **Avaliar & decidir** — critérios, ranking, Crossability e Score Card.
5. **Executar & medir** — cronograma, parceria, resultados e resumo.
6. **Governar** — pessoas usuárias, auditoria, evidências, importações e IA.

## Princípios de interface

- Toda página deve responder: **qual é o contexto, o estado, o risco e a
  próxima ação?**
- Dados de apoio ficam progressivamente revelados; a decisão não pode ser
  escondida em uma tabela longa.
- As regras RN022–RN039 aparecem como bloqueios e orientações no fluxo, nunca
  como erro técnico do backend.
- Uma parceria deve ter uma página única de operação, em vez de obrigar a pessoa
  a navegar por módulos técnicos para achar contrato, entrega ou ROI.
- A interface de administração/governança fica separada do trabalho diário.

## Ordem de implementação

1. Reorganizar a navegação e o dashboard por jornada.
2. Consolidar a página de parceria em abas: acordo, execução, acompanhamento e
   resultados.
3. Criar Cliente & Contrato e o fluxo de criação guiada de projeto.
4. Criar Governança: usuários, evidências, importação e auditoria.
5. Trocar o store mock por adaptadores da API, começando por autenticação,
   sessão, clientes, partes, projetos e candidaturas.
