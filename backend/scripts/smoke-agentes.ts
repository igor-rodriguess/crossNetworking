import {
  executarMarketIntelligenceSchema,
  executarPartnerDiscoverySchema,
} from "../src/modules/agentes/agentes.schema";
import {
  executarMarketIntelligence,
  executarPartnerDiscovery,
} from "../src/modules/agentes/agentes.service";

const limites = {
  limite_consultas: 2,
  limite_resultados_por_consulta: 1,
  limite_urls: 2,
  limite_candidatos: 2,
};

async function executar(nome: string, fn: () => Promise<unknown>) {
  const inicio = Date.now();
  try {
    const resultado = (await fn()) as {
      pipeline: string;
      status: string;
      execucao_id: string;
      etapas: Array<{ nome: string; status: string; origem?: string }>;
      coleta: { total_resultados: number };
      rag: { total: number } | null;
      extracao: { perfis: Array<{ nome: string }> };
      recomendacao: { ranking: Array<{ parceiro: string; score: number }> } | null;
    };
    console.log(
      JSON.stringify(
        {
          agente: nome,
          pipeline: resultado.pipeline,
          status: resultado.status,
          execucao_id: resultado.execucao_id,
          duracao_ms: Date.now() - inicio,
          etapas: resultado.etapas,
          resultados_coletados: resultado.coleta.total_resultados,
          trechos_rag: resultado.rag?.total ?? 0,
          perfis: resultado.extracao.perfis.map((p) => p.nome),
          ranking: resultado.recomendacao?.ranking ?? [],
        },
        null,
        2
      )
    );
  } catch (erro) {
    console.error(`${nome} falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  }
}

async function main() {
  await executar("Partner Discovery", () =>
    executarPartnerDiscovery(
      executarPartnerDiscoverySchema.parse({
        cliente: "Cross Networking",
        objetivo: "Encontrar marcas brasileiras com potencial de parceria para projetos de música e entretenimento",
        contexto: "Priorizar marcas com ativos de marca, público jovem, presença nacional e sinais de patrocínio.",
        ...limites,
      }),
      null
    )
  );

  await executar("Market Intelligence", () =>
    executarMarketIntelligence(
      executarMarketIntelligenceSchema.parse({
        cliente: "Cross Networking",
        objetivo: "Mapear oportunidades atuais de mercado, eventos e movimentos de marcas para parcerias em música e entretenimento",
        entidade_foco: "mercado brasileiro de música e entretenimento",
        contexto: "Priorizar sinais recentes de patrocínio, ativações, lançamentos e presença em eventos.",
        ...limites,
      }),
      null
    )
  );
}

void main();
