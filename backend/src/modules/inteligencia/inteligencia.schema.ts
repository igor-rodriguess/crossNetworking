import { z } from "zod";

const uuid = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "deve ser um UUID"
);
const texto = z.string().trim().min(1).optional();
const data = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").optional();
const moeda = z.string().trim().regex(/^[A-Z]{3}$/, "use o código ISO de 3 letras (ex.: BRL)").optional();
const confianca = z.number().min(0).max(1, "nivel_confianca vai de 0 a 1").optional();

// --- RF010 · Perfil estratégico versionado ---------------------------------

export const criarPerfilSchema = z
  .object({
    resumo: texto,
    posicionamento: texto,
    objetivos: texto,
    desafios: texto,
    frentes_prioritarias: texto,
    responsavel_marca: texto,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo do perfil" });
export type CriarPerfilInput = z.infer<typeof criarPerfilSchema>;

// --- RF011 · Catálogos e associações ---------------------------------------

/**
 * Nome de item de vocabulário controlado (público, praça, território).
 *
 * `min(1)` não bastava: uma importação que quebrou textos por vírgula gravou
 * entradas como "por tabela", "urbanos" e "num vínculo multigeracional entre
 * gerações." como se fossem públicos. São fragmentos de frase, não termos de
 * catálogo — e poluíram o vocabulário a ponto de precisar de limpeza manual.
 *
 * As regras abaixo rejeitam o formato de fragmento sem engessar termos legítimos
 * ("Experiências à mesa", "Homens 21-40" e "Comunidade de fitness" passam).
 */
const nomeVocabulario = z
  .string()
  .trim()
  .min(2, "nome muito curto")
  .max(80, "nome muito longo para um item de vocabulário — parece uma frase")
  .refine((v) => !v.endsWith("."), "nome não deve terminar em ponto — parece um trecho de frase")
  .refine((v) => !/\?/.test(v), "nome contém '?' — provável falha de codificação de caracteres")
  .refine(
    // Limite calibrado contra o vocabulário real: "Consumidores de produtos
    // para rotina de cuidados com a pele" (10 palavras) é um público legítimo;
    // acima disso já é descrição, não termo de catálogo.
    (v) => v.split(/\s+/).length <= 12,
    "nome com palavras demais — descreva o termo, não a frase inteira"
  )
  .refine(
    // Conectivos no início denunciam um pedaço de frase maior.
    (v) => !/^(e|ou|com|sem|por|para|que|de|da|do|no|na|num|numa)\s/i.test(v),
    "nome começa por conectivo — parece continuação de outra frase"
  );

export const criarPublicoSchema = z.object({
  nome: nomeVocabulario,
  descricao: texto,
  faixa_etaria: texto,
});
export type CriarPublicoInput = z.infer<typeof criarPublicoSchema>;

export const criarPracaSchema = z.object({
  nome: nomeVocabulario,
  uf: z.string().trim().length(2).optional(),
  pais: texto,
});
export type CriarPracaInput = z.infer<typeof criarPracaSchema>;

export const criarTerritorioSchema = z.object({
  codigo: z.string().trim().min(1, "codigo é obrigatório"),
  nome: nomeVocabulario,
  descricao: texto,
});
export type CriarTerritorioInput = z.infer<typeof criarTerritorioSchema>;

export const vincularPublicoSchema = z.object({
  publico_id: uuid,
  relevancia: texto,
  vigente_desde: data,
  vigente_ate: data,
});
export type VincularPublicoInput = z.infer<typeof vincularPublicoSchema>;

export const vincularPracaSchema = z.object({ praca_id: uuid, relevancia: texto });
export type VincularPracaInput = z.infer<typeof vincularPracaSchema>;

export const vincularTerritorioSchema = z.object({ territorio_id: uuid, relevancia: texto });
export type VincularTerritorioInput = z.infer<typeof vincularTerritorioSchema>;

// --- RF012 · Ativos ---------------------------------------------------------

export const criarAtivoSchema = z
  .object({
    nome: z.string().trim().min(1, "nome é obrigatório"),
    categoria: texto,
    descricao: texto,
    valor_referencia: z.number().nonnegative().optional(),
    moeda,
  })
  .refine((o) => o.valor_referencia === undefined || o.moeda !== undefined, {
    message: "Informe a moeda junto com o valor de referência (RN038)",
    path: ["moeda"],
  });
export type CriarAtivoInput = z.infer<typeof criarAtivoSchema>;

export const atualizarAtivoSchema = z
  .object({
    nome: texto,
    categoria: texto,
    descricao: texto,
    valor_referencia: z.number().nonnegative().optional(),
    moeda,
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Informe ao menos um campo" });
export type AtualizarAtivoInput = z.infer<typeof atualizarAtivoSchema>;

// --- RF013 · Canais de mídia e medições ------------------------------------

export const criarCanalSchema = z.object({
  plataforma: z.string().trim().min(1, "plataforma é obrigatória"),
  identificador: texto,
  url: texto,
});
export type CriarCanalInput = z.infer<typeof criarCanalSchema>;

export const registrarMedicaoMidiaSchema = z.object({
  tipo_metrica_codigo: z.string().trim().min(1),
  valor: z.number(),
  unidade: texto,
  fonte: texto,
  nivel_confianca: confianca,
});
export type RegistrarMedicaoMidiaInput = z.infer<typeof registrarMedicaoMidiaSchema>;

// --- RF014 · Disponibilidade (parte XOR ativo) -----------------------------

export const criarDisponibilidadeSchema = z
  .object({
    parte_id: uuid.optional(),
    ativo_id: uuid.optional(),
    tipo_disponibilidade_codigo: z.string().trim().min(1),
    data_inicio: z.string().trim().min(1, "data_inicio é obrigatória"),
    data_fim: z.string().trim().min(1, "data_fim é obrigatória"),
    motivo_indisponibilidade: texto,
    observacoes: texto,
  })
  .refine((o) => (o.parte_id ? 1 : 0) + (o.ativo_id ? 1 : 0) === 1, {
    message: "Informe exatamente um entre parte_id e ativo_id (RN — disponibilidade)",
    path: ["parte_id"],
  });
export type CriarDisponibilidadeInput = z.infer<typeof criarDisponibilidadeSchema>;

// --- RF015 · Artistas -------------------------------------------------------

export const criarRepresentacaoSchema = z.object({
  representante_parte_id: uuid,
  tipo_representacao: z.string().trim().min(1, "tipo_representacao é obrigatório"),
  vigente_desde: data,
  vigente_ate: data,
});
export type CriarRepresentacaoInput = z.infer<typeof criarRepresentacaoSchema>;

export const criarTurneSchema = z.object({
  nome: z.string().trim().min(1, "nome é obrigatório"),
  descricao: texto,
  data_inicio: data,
  data_fim: data,
});
export type CriarTurneInput = z.infer<typeof criarTurneSchema>;

export const criarEventoTurneSchema = z.object({
  nome: texto,
  cidade: texto,
  local: texto,
  data_evento: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD"),
});
export type CriarEventoTurneInput = z.infer<typeof criarEventoTurneSchema>;

export const criarBigMomentSchema = z.object({
  titulo: z.string().trim().min(1, "titulo é obrigatório"),
  descricao: texto,
  categoria: texto,
  data_prevista: data,
});
export type CriarBigMomentInput = z.infer<typeof criarBigMomentSchema>;

export const criarEventoAgendaSchema = z.object({
  titulo: z.string().trim().min(1, "titulo é obrigatório"),
  descricao: texto,
  local: texto,
  data_inicio: z.string().trim().min(1, "data_inicio é obrigatória"),
  data_fim: texto,
});
export type CriarEventoAgendaInput = z.infer<typeof criarEventoAgendaSchema>;
