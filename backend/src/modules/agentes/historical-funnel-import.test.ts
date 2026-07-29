import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../app";

function planilhaDeTeste(sufixo: string) {
  return `${sufixo},,,,,,,
TERRITÓRIO,SETOR,MARCA / TALENTO,STATUS,OBS,OBJETIVO,MODELO DE PARCERIA,HISTÓRICO
EXPERIÊNCIA DE MARCA,,,,,,,
LIFESTYLE,EVENTOS,Marca Rio ${sufixo},EM NEGOCIAÇÃO,Material enviado,Ativação de marca,Collab,
,,Grupo PHD ${sufixo},DECLINADO NO MOMENTO,Sem oportunidade,Experiência de Marca,,
COLLABS,,,,,,,
MODA,FITNESS,Yonex ${sufixo},SEM RETORNO,Aguardando retorno,Collab,,
URBAN,,,,,,,
TERRITÓRIO,SETOR,MARCA / TALENTO,STATUS,OBS,OBJETIVO,MODELO DE PARCERIA,HISTÓRICO
EXPERIÊNCIA DE MARCA,,,,,,,
ESPORTES,CORRIDA,Strava ${sufixo},FRENTE ABERTA,Agendando reunião,Experiência de Marca / Produto,,`;
}

describe("importação de funil histórico", () => {
  it("cria a árvore completa e não duplica uma segunda importação", async () => {
    const sufixo = `Cliente Histórico ${Date.now()}`;
    const conteudo = planilhaDeTeste(sufixo);

    const previa = await request(app)
      .post("/v1/agentes/csv/funil-historico/analisar")
      .send({ conteudo });
    expect(previa.status, JSON.stringify(previa.body)).toBe(201);
    expect(previa.body).toMatchObject({ cliente: sufixo, projetos: 2, marcas: 4, candidaturas: 4 });

    const primeira = await request(app)
      .post("/v1/agentes/csv/funil-historico/confirmar")
      .send({ conteudo })
      .expect(201);
    expect(primeira.body).toMatchObject({
      cliente: { nome: sufixo, criado: true },
      projetos: { criados: 2 },
      partes: { criados: 4 },
      candidaturas: { criados: 4 },
      erros: [],
    });

    const repetida = await request(app)
      .post("/v1/agentes/csv/funil-historico/confirmar")
      .send({ conteudo })
      .expect(201);
    expect(repetida.body).toMatchObject({
      projetos: { criados: 0, existentes: 2 },
      partes: { criados: 0, existentes: 4 },
      candidaturas: { criados: 0, existentes: 4 },
      erros: [],
    });
  });
});
