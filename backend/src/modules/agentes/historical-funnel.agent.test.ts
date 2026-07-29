import { describe, expect, it } from "vitest";
import { frenteDaLinhaHistorica, lerFunilHistorico } from "./historical-funnel.agent";

const planilhaAramis = `ARAMIS,,,,,,,
TERRITÓRIO,SETOR,MARCA / TALENTO,STATUS,OBS,OBJETIVO,MODELO DE PARCERIA,HISTÓRICO
EXPERIÊNCIA DE MARCA,,,,,,,
LIFESTYLE,EVENTOS,RIO OPEN 27,EM NEGOCIAÇÃO,MATERIAL ENVIADO A ARAMIS,Experiência de Marca,Collab,
,,GRUPO PHD,DECLINADO NO MOMENTO,POR OPORTUNIDADE,Experiência de Marca,,
COLLABS,,,,,,,
MODA,FITNESS,YONEX,SEM RETORNO,AGUARDANDO RETORNO DA MARCA,Collab,,
URBAN,,,,,,,
TERRITÓRIO,SETOR,MARCA / TALENTO,STATUS,OBS,OBJETIVO,MODELO DE PARCERIA,HISTÓRICO
EXPERIÊNCIA DE MARCA,,,,,,,
ESPORTES,CORRIDA,STRAVA,FRENTE ABERTA,AGENDANDO REUNIÃO,Experiência de Marca / Produto,,
ARAMIS NEXT,,,,,,,
TERRITÓRIO,SETOR,MARCA / TALENTO,STATUS,OBS,OBJETIVO,MODELO DE PARCERIA,HISTÓRICO
COLLABS,,,,,,,
MODA,ACESSÓRIOS,KIPLING,VALIDAR COM ARAMIS,REUNIÃO AGENDADA COM TIME NEXT,Collab,,`;

describe("leitor de funil histórico", () => {
  it("preserva projetos, hierarquia herdada e registros de parceria", () => {
    const leitura = lerFunilHistorico(planilhaAramis);

    expect(leitura.cliente).toBe("ARAMIS");
    expect(leitura.linhas).toHaveLength(5);
    expect(leitura.linhas.map((linha) => linha.projeto)).toEqual(["ARAMIS", "ARAMIS", "ARAMIS", "URBAN", "ARAMIS NEXT"]);
    expect(leitura.linhas[1]).toMatchObject({ marca: "GRUPO PHD", territorio: "LIFESTYLE", setor: "EVENTOS" });
    expect(frenteDaLinhaHistorica(leitura.linhas[0])).toBe("EXPERIÊNCIA DE MARCA · LIFESTYLE · EVENTOS");
    expect(leitura.linhas[4]).toMatchObject({ marca: "KIPLING", secao: "COLLABS", setor: "ACESSÓRIOS" });
  });
});
