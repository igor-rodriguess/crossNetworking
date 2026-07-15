import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Governança & IA — RF048–RF051

let n = 0;
const unico = () => `${Date.now()}.${n++}`;

async function criarOrganizacao(): Promise<string> {
  const nome = `Org ${unico()}`;
  const x = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  return x.body.id as string;
}

/** Cria um perfil estratégico (alvo válido para vínculo de evidência). */
async function criarPerfil(parteId: string): Promise<string> {
  const x = await request(app)
    .post(`/v1/partes/${parteId}/perfis-estrategicos`)
    .send({ posicionamento: "Premium" })
    .expect(201);
  return x.body.id as string;
}

describe("RF048 · Fontes e evidências", () => {
  it("cria fonte, evidência e vincula a um perfil por FK explícita", async () => {
    const fonte = await request(app).post("/v1/fontes").send({ nome: `IBOPE ${unico()}`, tipo: "pesquisa" }).expect(201);

    const ev = await request(app)
      .post("/v1/evidencias")
      .send({ titulo: "Alcance validado", fonte_id: fonte.body.id, nivel_confianca: 0.9, validade_inicio: "2026-01-01", validade_fim: "2026-12-31" });
    expect(ev.status).toBe(201);
    expect(ev.body.nivel_confianca).toBe(0.9);

    const parteId = await criarOrganizacao();
    const perfilId = await criarPerfil(parteId);

    const vinc = await request(app)
      .post(`/v1/evidencias/${ev.body.id}/vinculos`)
      .send({ alvo_tipo: "perfil_estrategico", alvo_id: perfilId, relevancia: "alta" });
    expect(vinc.status).toBe(201);
    expect(vinc.body.vinculos).toHaveLength(1);
    expect(vinc.body.vinculos[0].alvo_tipo).toBe("perfil_estrategico");

    const obtida = await request(app).get(`/v1/evidencias/${ev.body.id}`).expect(200);
    expect(obtida.body.vinculos).toHaveLength(1);
  });

  it("rejeita validade invertida (422) e alvo inexistente (404)", async () => {
    await request(app)
      .post("/v1/evidencias")
      .send({ titulo: "X", validade_inicio: "2026-12-31", validade_fim: "2026-01-01" })
      .expect(422);

    const ev = await request(app).post("/v1/evidencias").send({ titulo: "Y" }).expect(201);
    const res = await request(app)
      .post(`/v1/evidencias/${ev.body.id}/vinculos`)
      .send({ alvo_tipo: "resultado", alvo_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });
});

describe("RF049 · Consulta de auditoria (somente leitura)", () => {
  it("consulta a trilha de um registro recém-criado", async () => {
    const parteId = await criarOrganizacao();

    const porRegistro = await request(app).get(`/v1/registros/parte/${parteId}/auditoria`).expect(200);
    expect(Array.isArray(porRegistro.body.itens)).toBe(true);
    expect(porRegistro.body.itens.length).toBeGreaterThan(0);
    expect(porRegistro.body.itens[0].operacao).toBe("INSERT");

    const filtrada = await request(app).get("/v1/auditoria?tabela=parte&operacao=INSERT&limite=5").expect(200);
    expect(filtrada.body.itens.length).toBeGreaterThan(0);
  });
});

describe("RF050 · Importação de planilhas", () => {
  it("importa linhas válidas e reporta as rejeitadas (207)", async () => {
    const nome = `Import ${unico()}`;
    const res = await request(app)
      .post("/v1/importacoes/partes")
      .send({
        itens: [
          { tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } },
          { tipo: "organizacao" }, // inválida — sem nome_exibicao
        ],
      });
    expect(res.status).toBe(207);
    expect(res.body.total).toBe(2);
    expect(res.body.importados).toBe(1);
    expect(res.body.rejeitados).toBe(1);
    expect(res.body.detalhes_rejeitados[0].linha).toBe(2);
  });
});

describe("RF051 · Base de conhecimento para IA", () => {
  it("retorna snapshot estruturado e rastreável da Parte", async () => {
    const parteId = await criarOrganizacao();
    const perfilId = await criarPerfil(parteId);
    await request(app).post(`/v1/perfis-estrategicos/${perfilId}/vigencia`).expect(200);

    const base = await request(app).get(`/v1/ia/base-conhecimento/partes/${parteId}`).expect(200);
    expect(base.body.parte.id).toBe(parteId);
    expect(base.body.perfil_vigente.posicionamento).toBe("Premium");
    expect(base.body.proveniencia).toBeDefined();
  });

  it("404 para Parte inexistente", async () => {
    await request(app).get("/v1/ia/base-conhecimento/partes/00000000-0000-0000-0000-000000000000").expect(404);
  });
});
