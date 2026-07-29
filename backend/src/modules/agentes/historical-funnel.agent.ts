// Leitor determinístico para planilhas históricas de parcerias. Esse formato
// costuma ter títulos de projeto, cabeçalhos repetidos e células vazias que
// herdam o território/setor da linha anterior; portanto não pode ser tratado
// como uma tabela CSV simples.

export interface LinhaFunilHistorico {
  linha: number;
  projeto: string;
  secao: string;
  territorio: string;
  setor: string;
  marca: string;
  status_origem: string;
  observacoes: string;
  objetivo: string;
  modelo_parceria: string;
  historico: string;
}

export interface LeituraFunilHistorico {
  cliente: string;
  linhas: LinhaFunilHistorico[];
  avisos: string[];
}

function normalizar(texto: string): string {
  return texto
    .replace(/\uFFFD/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectarSeparador(texto: string): "," | ";" {
  return (texto.match(/;/g) ?? []).length > (texto.match(/,/g) ?? []).length ? ";" : ",";
}

function lerRegistros(texto: string, separador: string): string[][] {
  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = "";
  let dentroAspas = false;

  const concluirCampo = () => {
    registro.push(campo.trim());
    campo = "";
  };
  const concluirRegistro = () => {
    concluirCampo();
    if (registro.some((valor) => valor.trim())) registros.push(registro);
    registro = [];
  };

  for (let indice = 0; indice < texto.length; indice++) {
    const caractere = texto[indice];
    if (caractere === '"') {
      if (dentroAspas && texto[indice + 1] === '"') {
        campo += '"';
        indice++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (caractere === separador && !dentroAspas) {
      concluirCampo();
    } else if (caractere === "\n" && !dentroAspas) {
      concluirRegistro();
    } else {
      campo += caractere;
    }
  }
  if (campo.length || registro.length) concluirRegistro();
  return registros;
}

function temCabecalhoDeFunil(registro: string[]): boolean {
  const valores = registro.map(normalizar);
  return valores.some((valor) => valor.includes("marca") || valor.includes("talento"))
    && valores.some((valor) => valor.startsWith("status"))
    && valores.some((valor) => valor.startsWith("territ"));
}

function apenasUmValor(registro: string[]): string | null {
  const valores = registro.map((valor) => valor.trim()).filter(Boolean);
  return valores.length === 1 ? valores[0] : null;
}

function proximoRegistroNaoVazio(registros: string[][], indice: number): string[] | null {
  for (let atual = indice + 1; atual < registros.length; atual++) {
    if (registros[atual].some((valor) => valor.trim())) return registros[atual];
  }
  return null;
}

function localizarColuna(cabecalho: string[], ...termos: string[]): number {
  return cabecalho.findIndex((campo) => {
    const valor = normalizar(campo);
    return termos.some((termo) => valor.includes(termo));
  });
}

function valorDaColuna(registro: string[], coluna: number): string {
  return coluna >= 0 ? (registro[coluna] ?? "").trim() : "";
}

function nomeDaFrente(linha: LinhaFunilHistorico): string {
  const partes = [linha.secao, linha.territorio, linha.setor]
    .filter(Boolean)
    .filter((valor, indice, valores) => indice === 0 || normalizar(valor) !== normalizar(valores[indice - 1]));
  return partes.join(" · ") || "Parcerias gerais";
}

/** Nome da frente usado pela importação para manter o mesmo agrupamento. */
export function frenteDaLinhaHistorica(linha: LinhaFunilHistorico): string {
  return nomeDaFrente(linha);
}

/**
 * Lê um CSV no padrão de acompanhamento de parceiros. O primeiro título antes
 * do cabeçalho identifica o cliente e também o primeiro projeto. Títulos que
 * antecedem um novo cabeçalho iniciam os projetos seguintes; títulos internos
 * como "COLLABS" e "EXPERIÊNCIA DE MARCA" são seções das frentes.
 */
export function lerFunilHistorico(conteudo: string): LeituraFunilHistorico {
  const texto = conteudo.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const registros = lerRegistros(texto, detectarSeparador(texto));
  const avisos: string[] = [];
  if (conteudo.includes("\uFFFD")) {
    avisos.push("Há caracteres com codificação inválida; envie o CSV original do Excel para preservar os acentos.");
  }

  const primeiroCabecalho = registros.findIndex(temCabecalhoDeFunil);
  if (primeiroCabecalho < 0) {
    return { cliente: "", linhas: [], avisos: ["Não encontrei o cabeçalho TERRITÓRIO / MARCA OU TALENTO / STATUS.", ...avisos] };
  }

  const tituloInicial = registros.slice(0, primeiroCabecalho).map(apenasUmValor).find(Boolean)?.trim() ?? "";
  let cliente = tituloInicial;
  let projeto = tituloInicial;
  let secao = "";
  let territorio = "";
  let setor = "";
  let cabecalho: string[] = [];
  let colunas = { territorio: -1, setor: -1, marca: -1, status: -1, observacoes: -1, objetivo: -1, modelo: -1, historico: -1 };
  let cabecalhosRepetidos = 0;
  let titulosSecao = 0;
  const linhas: LinhaFunilHistorico[] = [];

  for (const [indice, registro] of registros.entries()) {
    if (temCabecalhoDeFunil(registro)) {
      if (cabecalho.length) cabecalhosRepetidos++;
      cabecalho = registro;
      colunas = {
        territorio: localizarColuna(cabecalho, "territ"),
        setor: localizarColuna(cabecalho, "setor"),
        marca: localizarColuna(cabecalho, "marca", "talento"),
        status: localizarColuna(cabecalho, "status"),
        observacoes: localizarColuna(cabecalho, "obs", "observac"),
        objetivo: localizarColuna(cabecalho, "objetivo"),
        modelo: localizarColuna(cabecalho, "modelo_de_parceria", "modelo"),
        historico: localizarColuna(cabecalho, "historico"),
      };
      territorio = "";
      setor = "";
      continue;
    }

    const titulo = apenasUmValor(registro);
    if (titulo) {
      if (indice < primeiroCabecalho) continue;
      const proximo = proximoRegistroNaoVazio(registros, indice);
      if (proximo && temCabecalhoDeFunil(proximo)) {
        projeto = titulo;
        if (!cliente) cliente = titulo;
        secao = "";
        territorio = "";
        setor = "";
      } else {
        secao = titulo;
        territorio = "";
        setor = "";
        titulosSecao++;
      }
      continue;
    }

    if (!cabecalho.length) continue;
    const marca = valorDaColuna(registro, colunas.marca);
    if (!marca) continue;
    const territorioDaLinha = valorDaColuna(registro, colunas.territorio);
    const setorDaLinha = valorDaColuna(registro, colunas.setor);
    if (territorioDaLinha) territorio = territorioDaLinha;
    if (setorDaLinha) setor = setorDaLinha;
    if (!projeto) projeto = cliente || "Importação histórica";

    linhas.push({
      linha: indice + 1,
      projeto,
      secao,
      territorio,
      setor,
      marca,
      status_origem: valorDaColuna(registro, colunas.status),
      observacoes: valorDaColuna(registro, colunas.observacoes),
      objetivo: valorDaColuna(registro, colunas.objetivo),
      modelo_parceria: valorDaColuna(registro, colunas.modelo),
      historico: valorDaColuna(registro, colunas.historico),
    });
  }

  if (!cliente && linhas.length) cliente = linhas[0].projeto;
  if (cabecalhosRepetidos) avisos.push(`${cabecalhosRepetidos} cabeçalho(s) repetido(s) foram reconhecidos.`);
  if (titulosSecao) avisos.push(`${titulosSecao} título(s) de seção foram usados para organizar as frentes.`);
  if (!linhas.length) avisos.push("Nenhuma marca ou talento foi encontrado nas linhas da planilha.");
  return { cliente, linhas, avisos };
}
