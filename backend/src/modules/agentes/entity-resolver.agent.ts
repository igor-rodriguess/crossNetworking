import { PoolClient } from "pg";
import * as repo from "./agentes.repository";
import {
  entidadesSaidaSchema,
  type EntidadesSaida,
  type ResolverEntidadesInput,
  type StatusEntidade,
} from "./agentes.schema";

// -----------------------------------------------------------------------------
// Entity Resolver — parte 3 da validação (dedupe + casa com a base real).
//
// O PRIMEIRO agente que consulta o domínio da plataforma: para cada entidade
// encontrada na pesquisa, procura Partes já cadastradas com nome parecido e
// classifica — "nova" (ninguém parecido), "possivel_duplicata" (um match forte)
// ou "ambigua" (vários matches razoáveis). Evita recadastrar o que já existe.
//
// Determinístico: normaliza os nomes e calcula similaridade sem LLM. (O LLM
// pode entrar depois para casos difíceis de sinônimos/abreviações.)
// -----------------------------------------------------------------------------

/** Normaliza um nome para comparação: minúsculas, sem acento, sem ruído. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (combining marks)
    .replace(/\b(ltda|s\.?a\.?|me|eireli|inc|corp|group|grupo)\b/g, "") // sufixos societários
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Similaridade 0..100 entre dois nomes: Dice sobre bigramas + bônus de contido. */
function similaridade(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  // Um contido no outro (ex.: "aurora" em "aurora bebidas") — sinal forte.
  if (na.includes(nb) || nb.includes(na)) {
    const menor = Math.min(na.length, nb.length);
    const maior = Math.max(na.length, nb.length);
    return Math.round(70 + 25 * (menor / maior)); // 70..95
  }

  // Coeficiente de Dice sobre bigramas de caracteres.
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(na.replace(/\s/g, ""));
  const bb = bigrams(nb.replace(/\s/g, ""));
  if (ba.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter++;
  return Math.round((200 * inter) / (ba.size + bb.size));
}

function classificar(candidatas: { similaridade: number }[]): { status: StatusEntidade; observacao: string } {
  const fortes = candidatas.filter((c) => c.similaridade >= 80);
  const medias = candidatas.filter((c) => c.similaridade >= 55 && c.similaridade < 80);

  if (fortes.length === 1 && medias.length === 0) {
    return { status: "possivel_duplicata", observacao: "Já existe uma Parte muito parecida — provável duplicata." };
  }
  if (fortes.length + medias.length >= 2) {
    return { status: "ambigua", observacao: "Várias Partes parecidas — revisar manualmente qual (se alguma) é a mesma." };
  }
  if (fortes.length === 1) {
    return { status: "possivel_duplicata", observacao: "Uma Parte muito parecida encontrada." };
  }
  return { status: "nova", observacao: "Nenhuma Parte parecida na base — candidata a novo cadastro." };
}

export interface ResultadoEntidadesAgente {
  saida: EntidadesSaida;
}

/** Resolve entidades contra a base de Partes. Recebe o client (roda em transação). */
export async function resolverEntidades(
  client: PoolClient,
  input: ResolverEntidadesInput
): Promise<ResultadoEntidadesAgente> {
  // Dedupe das entradas (normalizadas) — não resolver a mesma duas vezes.
  const vistos = new Map<string, string>(); // normalizado -> original
  for (const e of input.entidades) {
    const n = normalizar(e);
    if (n && !vistos.has(n)) vistos.set(n, e.trim());
  }

  const resolucoes = [];
  for (const entidade of vistos.values()) {
    const partes = await repo.buscarPartesPorNome(client, entidade.split(/\s+/)[0], input.tipo ?? null, 10);
    const candidatas = partes
      .map((p) => ({ parte_id: p.id, nome: p.nome, similaridade: similaridade(entidade, p.nome) }))
      .filter((c) => c.similaridade >= 40)
      .sort((a, b) => b.similaridade - a.similaridade)
      .slice(0, 5);
    const { status, observacao } = classificar(candidatas);
    resolucoes.push({ entidade, status, candidatas, observacao });
  }

  const resumo = {
    nova: resolucoes.filter((r) => r.status === "nova").length,
    possivel_duplicata: resolucoes.filter((r) => r.status === "possivel_duplicata").length,
    ambigua: resolucoes.filter((r) => r.status === "ambigua").length,
  };

  const saida = entidadesSaidaSchema.parse({ total: resolucoes.length, resumo, resolucoes });
  return { saida };
}
