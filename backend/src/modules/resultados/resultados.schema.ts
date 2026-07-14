import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();
const data = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD");
const moeda = z.string().trim().regex(/^[A-Z]{3}$/, "use o código ISO de 3 letras (ex.: BRL)");
const confianca = z.number().min(0).max(1, "nivel_confianca vai de 0 a 1").optional();

// --- Acompanhamento (RF043) -------------------------------------------------

export const criarAcompanhamentoSchema = z.object({
  descricao: z.string().trim().min(1, "descricao é obrigatória"),
  data_registro: texto,
});
export type CriarAcompanhamentoInput = z.infer<typeof criarAcompanhamentoSchema>;

// --- Indicadores e medições (RF044 — RN030, RN036) -------------------------

export const criarIndicadorSchema = z.object({
  nome: z.string().trim().min(1, "nome é obrigatório"),
  tipo_metrica_codigo: z.string().trim().min(1),
  unidade: texto,
  descricao: texto,
});
export type CriarIndicadorInput = z.infer<typeof criarIndicadorSchema>;

export const vincularIndicadorSchema = z.object({
  indicador_id: uuid,
  meta: z.number().optional(),
});
export type VincularIndicadorInput = z.infer<typeof vincularIndicadorSchema>;

export const registrarMedicaoSchema = z
  .object({
    indicador_id: uuid,
    periodo_inicio: data,
    periodo_fim: data,
    valor: z.number(),
    unidade: texto,
    fonte: texto,
    nivel_confianca: confianca,
  })
  .refine((o) => o.periodo_fim >= o.periodo_inicio, {
    message: "periodo_fim não pode ser anterior a periodo_inicio (RN030)",
    path: ["periodo_fim"],
  });
export type RegistrarMedicaoInput = z.infer<typeof registrarMedicaoSchema>;

// --- Resultado (RF045 — RN038) ----------------------------------------------

export const registrarResultadoSchema = z
  .object({
    descricao: z.string().trim().min(1, "descricao é obrigatória"),
    valor: z.number().nonnegative().optional(),
    moeda: moeda.optional(),
    alcance_realizado: z.number().optional(),
  })
  .refine((o) => o.valor === undefined || o.moeda !== undefined, {
    message: "Informe a moeda junto com o valor (RN038)",
    path: ["moeda"],
  });
export type RegistrarResultadoInput = z.infer<typeof registrarResultadoSchema>;

// --- Cálculo de ROI (RF046 — RN033, RN039) ---------------------------------

/**
 * O ROI não é aceito do cliente: é derivado no servidor a partir do
 * investimento e do retorno (RN039 — fonte única de cálculo).
 */
export const calcularRoiSchema = z
  .object({
    investimento_estimado: z.number().nonnegative().optional(),
    investimento_realizado: z.number().nonnegative().optional(),
    retorno_estimado: z.number().nonnegative().optional(),
    retorno_realizado: z.number().nonnegative().optional(),
    moeda,
    premissas: texto,
    nivel_confianca: confianca,
  })
  .refine(
    (o) =>
      (o.investimento_realizado !== undefined && o.retorno_realizado !== undefined) ||
      (o.investimento_estimado !== undefined && o.retorno_estimado !== undefined),
    {
      message:
        "Informe investimento e retorno do mesmo tipo (ambos realizados ou ambos estimados) para calcular o ROI",
      path: ["investimento_estimado"],
    }
  );
export type CalcularRoiInput = z.infer<typeof calcularRoiSchema>;

// --- Encerramentos (RF047 — RN034) ------------------------------------------

export const encerrarProjetoSchema = z.object({
  motivo: z.string().trim().min(1, "motivo é obrigatório"),
  resultados_gerais: texto,
  aprendizados: texto,
  proximos_passos: texto,
});
export type EncerrarProjetoInput = z.infer<typeof encerrarProjetoSchema>;

export const encerrarParceriaSchema = z.object({
  motivo: z.string().trim().min(1, "motivo é obrigatório"),
  resultados: texto,
  cumprimento_contrapartidas: texto,
  indicadores_finais: texto,
  aprendizados: texto,
});
export type EncerrarParceriaInput = z.infer<typeof encerrarParceriaSchema>;
