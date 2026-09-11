/**
 * Gera os cenários de validação do Entity Intelligence Agent (AI-03).
 *
 * O CASO A usa o Evidence Package REAL da AI-02.3 (Converse, 5 fatos extraídos
 * de Bloomberg e FashionUnited). Os demais casos são controlados.
 *
 * Determinístico: nenhuma chamada de LLM, nenhuma rede, custo zero.
 *
 * Uso: npx tsx scripts/showcase-entity-intelligence.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  calcularDiff,
  construirPerfil,
  type EntradaPerfil,
} from "../src/modules/agentes/entidade/entity-intelligence.agent";
import type { EvidencePackage } from "../src/modules/agentes/evidencia/evidencia.schema";

const RAW = join(process.cwd(), "..", "docs", "ai", "validation", "raw");
const SAIDA = join(RAW, "entity-intelligence");

function gravar(nome: string, dados: unknown) {
  writeFileSync(join(SAIDA, `${nome}.json`), JSON.stringify(dados, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(`gravado: ${nome}.json`);
}

function main() {
  mkdirSync(SAIDA, { recursive: true });

  // ------------------------------------------------------------- CASO A
  // Evidence Package REAL da AI-02.3.
  const real = JSON.parse(
    readFileSync(join(RAW, "research-evidence-real-extraction", "converse", "evidence-package.json"), "utf8")
  ) as EvidencePackage;

  const entradaA: EntradaPerfil = {
    entidade: "Converse",
    dominio_oficial: "converse.com",
    // Converse não é cliente da Cross: entidade externa, sem Parte.
    internos: { parte_id: null, eh_cliente_cross: false },
    evidencia: real,
  };
  const perfilA = construirPerfil(entradaA);
  gravar("case-a-input", {
    entidade: entradaA.entidade,
    evidence_package: {
      status: real.status,
      facts: real.facts.length,
      sources: real.sources.length,
      lacunas: real.lacunas.length,
    },
    internos: entradaA.internos,
  });
  gravar("case-a-profile", perfilA);

  // ------------------------------------------------------------- CASO B
  // Entidade COM representação interna (fixture — não é dado real de cliente).
  const perfilB = construirPerfil({
    entidade: "Marca Cliente Exemplo",
    internos: {
      parte_id: "00000000-0000-0000-0000-0000000000b1",
      nome_exibicao: "Marca Cliente Exemplo",
      tipo: "organizacao",
      eh_cliente_cross: true,
      papeis: ["cliente", "parceiro"],
      oportunidades: [{ id: "op-exemplo-1", descricao: "Frente COLLABS · MODA — em negociação" }],
      projetos: [{ id: "prj-exemplo-1", descricao: "Plataforma Verão 2026" }],
      atualizado_em: new Date().toISOString(),
    },
    evidencia: {
      ...real,
      entidade: "Marca Cliente Exemplo",
      facts: [
        {
          fact_id: "fact_ex_1",
          claim: "A Marca Cliente Exemplo inaugurou uma loja em Salvador.",
          entidade: "Marca Cliente Exemplo",
          categoria: "expansao",
          natureza: "fato",
          source_refs: ["src_exemplo"],
          dominios_independentes: 1,
          verificacao: "fonte_unica",
          confianca: 50,
          publicado_em: "2026-06-15T00:00:00Z",
          coletado_em: new Date().toISOString(),
          conflito: null,
        },
      ],
    } as EvidencePackage,
  });
  gravar("case-b-profile", perfilB);

  // ------------------------------------------------------------- CASO C
  // Entidade externa sem registro interno.
  const perfilC = construirPerfil({
    entidade: "Empresa Externa Sem Cadastro",
    internos: { parte_id: null, eh_cliente_cross: false },
    evidencia: {
      ...real,
      entidade: "Empresa Externa Sem Cadastro",
      facts: [
        {
          fact_id: "fact_ext_1",
          claim: "A Empresa Externa Sem Cadastro atua no varejo de moda.",
          entidade: "Empresa Externa Sem Cadastro",
          categoria: "contexto_empresa",
          natureza: "fato",
          source_refs: ["src_ext"],
          dominios_independentes: 1,
          verificacao: "fonte_unica",
          confianca: 45,
          publicado_em: null,
          coletado_em: new Date().toISOString(),
          conflito: null,
        },
      ],
    } as EvidencePackage,
  });
  gravar("case-c-not-linked", perfilC);

  // ------------------------------------------------------------- CASO D
  // Conflito factual preservado.
  const fatoConflito = {
    fact_id: "fact_conf_a",
    claim: "A marca confirmou o patrocínio do festival de música.",
    entidade: "Marca Exemplo",
    categoria: "patrocinio",
    natureza: "fato" as const,
    source_refs: ["src_g1"],
    dominios_independentes: 1,
    verificacao: "conflitante" as const,
    confianca: 30,
    publicado_em: null,
    coletado_em: new Date().toISOString(),
    conflito: {
      claim_oposta: "A marca não confirmou o patrocínio do festival de música.",
      source_refs_oposta: ["src_exame"],
    },
  };
  const perfilD = construirPerfil({
    entidade: "Marca Exemplo",
    internos: { parte_id: null, eh_cliente_cross: false },
    evidencia: { ...real, entidade: "Marca Exemplo", facts: [fatoConflito], conflitos: [fatoConflito] } as EvidencePackage,
  });
  gravar("case-d-conflict", perfilD);

  // ------------------------------------------------------------- CASO E
  // Versionamento, idempotência e ausência-não-é-remoção.
  const base = { entidade: "Converse", dominio_oficial: "converse.com", internos: { parte_id: null, eh_cliente_cross: false } };

  const v1 = construirPerfil({ ...base, evidencia: real });
  gravar("profile-v1", v1);

  // Reexecução com os MESMOS inputs → mesmo hash.
  const v1b = construirPerfil({ ...base, evidencia: real });
  const idempotente = v1.hash_entrada === v1b.hash_entrada;

  // Nova evidência → nova versão. E o pacote novo NÃO repete os fatos antigos.
  const evidenciaNova = {
    ...real,
    facts: [
      {
        fact_id: "fact_novo_001",
        claim: "A Converse anunciou uma colaboração com um artista brasileiro.",
        entidade: "Converse",
        categoria: "parceria",
        natureza: "fato" as const,
        source_refs: ["src_novo"],
        dominios_independentes: 1,
        verificacao: "fonte_unica" as const,
        confianca: 50,
        publicado_em: "2026-08-01T00:00:00Z",
        coletado_em: new Date().toISOString(),
        conflito: null,
      },
    ],
  } as EvidencePackage;

  const v2 = construirPerfil({ ...base, evidencia: evidenciaNova, anterior: v1 });
  gravar("profile-v2", v2);

  const diff = calcularDiff(v1, v2);
  gravar("profile-diff", {
    hash_v1: v1.hash_entrada,
    hash_v2: v2.hash_entrada,
    idempotencia_mesmos_inputs: idempotente,
    versao_v1: v1.versao_perfil,
    versao_v2: v2.versao_perfil,
    diff,
    // Prova de que ausência não removeu: os fatos da v1 seguem na v2.
    fatos_v1_preservados_na_v2: v1.movimentos.filter((a) =>
      [...v2.movimentos, ...v2.produtos, ...v2.relacionamentos].some((b) => b.valor === a.valor)
    ).length,
    total_fatos_v1: v1.movimentos.length,
  });

  gravar("telemetry", {
    caso_a: perfilA.telemetria,
    caso_b: perfilB.telemetria,
    caso_c: perfilC.telemetria,
    caso_d: perfilD.telemetria,
    llm_calls_total: 0,
    custo_total_usd: 0,
  });

  // eslint-disable-next-line no-console
  console.log("\n=== RESUMO ===");
  for (const [nome, p] of [["A · Converse (real)", perfilA], ["B · cliente interno", perfilB], ["C · sem cadastro", perfilC], ["D · conflito", perfilD]] as const) {
    // eslint-disable-next-line no-console
    console.log(
      `${nome.padEnd(22)} vinculo=${p.identidade.vinculo.padEnd(14)} fatos=${p.telemetria.fatos_consolidados} conflitos=${p.conflitos.length} lacunas=${p.lacunas.length} llm=${p.telemetria.llm_calls}`
    );
  }
  // eslint-disable-next-line no-console
  console.log(`\nidempotencia (mesmos inputs -> mesmo hash): ${idempotente}`);
  // eslint-disable-next-line no-console
  console.log(`diff v1->v2: +${diff.adicionados.length} adicionados, ${diff.ausentes_nao_removidos.length} ausentes-nao-removidos`);
}

main();
