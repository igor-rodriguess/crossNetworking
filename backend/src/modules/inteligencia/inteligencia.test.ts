import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Inteligência Estratégica — RF010–RF015

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

async function criarPessoa(): Promise<string> {
  const nome = `Artista ${unico()}`;
  const x = await request(app)
    .post("/v1/partes")
    .send({ tipo: "pessoa", nome_exibicao: nome, pessoa: { nome_completo: nome } })
    .expect(201);
  return x.body.id as string;
}

describe("RF010 · Perfil estratégico versionado", () => {
  it("versiona e mantém uma única versão vigente por Parte", async () => {
    const parteId = await criarOrganizacao();

    const v1 = await request(app)
      .post(`/v1/partes/${parteId}/perfis-estrategicos`)
      .send({ posicionamento: "Premium", objetivos: "Expandir sul" });
    expect(v1.status).toBe(201);
    expect(v1.body.numero_versao).toBe(1);

    await request(app).post(`/v1/perfis-estrategicos/${v1.body.id}/vigencia`).expect(200);

    const v2 = await request(app)
      .post(`/v1/partes/${parteId}/perfis-estrategicos`)
      .send({ posicionamento: "Premium+", objetivos: "Nacional" })
      .expect(201);
    await request(app).post(`/v1/perfis-estrategicos/${v2.body.id}/vigencia`).expect(200);

    const lista = await request(app).get(`/v1/partes/${parteId}/perfis-estrategicos`).expect(200);
    const vigentes = lista.body.itens.filter((p: { status_versao: string }) => p.status_versao === "vigente");
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].numero_versao).toBe(2);
  });

  it("exige ao menos um campo (422) e valida 404 de Parte", async () => {
    const parteId = await criarOrganizacao();
    await request(app).post(`/v1/partes/${parteId}/perfis-estrategicos`).send({}).expect(422);
    await request(app)
      .post("/v1/partes/00000000-0000-0000-0000-000000000000/perfis-estrategicos")
      .send({ resumo: "x" })
      .expect(404);
  });
});

describe("RF011 · Públicos, praças e territórios", () => {
  it("cria catálogos, vincula à Parte, consolida e desvincula (associação ativa única)", async () => {
    const parteId = await criarOrganizacao();
    const pub = await request(app).post("/v1/publicos").send({ nome: `Jovens ${unico()}` }).expect(201);
    const pra = await request(app).post("/v1/pracas").send({ nome: `SP ${unico()}`, uf: "SP" }).expect(201);
    const ter = await request(app).post("/v1/territorios").send({ codigo: `t${unico()}`, nome: "Games" }).expect(201);

    await request(app).post(`/v1/partes/${parteId}/publicos`).send({ publico_id: pub.body.id, relevancia: "alta" }).expect(201);
    await request(app).post(`/v1/partes/${parteId}/pracas`).send({ praca_id: pra.body.id }).expect(201);
    await request(app).post(`/v1/partes/${parteId}/territorios`).send({ territorio_id: ter.body.id }).expect(201);

    const assoc = await request(app).get(`/v1/partes/${parteId}/associacoes`).expect(200);
    expect(assoc.body.publicos).toHaveLength(1);
    expect(assoc.body.pracas).toHaveLength(1);
    expect(assoc.body.territorios).toHaveLength(1);

    // A mesma associação ativa não pode ser duplicada
    const dup = await request(app).post(`/v1/partes/${parteId}/publicos`).send({ publico_id: pub.body.id });
    expect(dup.status).toBe(409);

    // Após arquivar, recriar é permitido
    await request(app).delete(`/v1/partes/${parteId}/publicos/${pub.body.id}`).expect(204);
    await request(app).post(`/v1/partes/${parteId}/publicos`).send({ publico_id: pub.body.id }).expect(201);
  });
});

describe("RF012 · Ativos", () => {
  it("cadastra, obtém, atualiza (If-Match) e exige moeda com valor", async () => {
    const parteId = await criarOrganizacao();

    const semMoeda = await request(app).post(`/v1/partes/${parteId}/ativos`).send({ nome: "Naming rights", valor_referencia: 1000 });
    expect(semMoeda.status).toBe(422);

    const ativo = await request(app)
      .post(`/v1/partes/${parteId}/ativos`)
      .send({ nome: "Naming rights", categoria: "propriedade", valor_referencia: 1000, moeda: "BRL" });
    expect(ativo.status).toBe(201);
    expect(ativo.body.valor_referencia).toBe(1000);

    const patch = await request(app)
      .patch(`/v1/ativos/${ativo.body.id}`)
      .set("If-Match", `"${ativo.body.versao}"`)
      .send({ categoria: "cota" });
    expect(patch.status).toBe(200);
    expect(patch.body.categoria).toBe("cota");

    const lista = await request(app).get(`/v1/partes/${parteId}/ativos`).expect(200);
    expect(lista.body.itens).toHaveLength(1);
  });
});

describe("RF013 · Canais de mídia e medições", () => {
  it("registra canal, mede alcance e preserva o histórico", async () => {
    const parteId = await criarOrganizacao();
    const canal = await request(app)
      .post(`/v1/partes/${parteId}/canais-midia`)
      .send({ plataforma: "instagram", identificador: "@marca" })
      .expect(201);

    await request(app).post(`/v1/canais-midia/${canal.body.id}/medicoes`).send({ tipo_metrica_codigo: "alcance", valor: 50000 }).expect(201);
    await request(app).post(`/v1/canais-midia/${canal.body.id}/medicoes`).send({ tipo_metrica_codigo: "engajamento", valor: 3.2, unidade: "%" }).expect(201);

    const lista = await request(app).get(`/v1/canais-midia/${canal.body.id}/medicoes`).expect(200);
    expect(lista.body.itens).toHaveLength(2);
  });

  it("rejeita tipo de métrica inexistente (422)", async () => {
    const parteId = await criarOrganizacao();
    const canal = await request(app).post(`/v1/partes/${parteId}/canais-midia`).send({ plataforma: "tiktok" }).expect(201);
    const res = await request(app).post(`/v1/canais-midia/${canal.body.id}/medicoes`).send({ tipo_metrica_codigo: "nao_existe", valor: 1 });
    expect(res.status).toBe(422);
  });
});

describe("RF014 · Disponibilidade (Parte XOR ativo)", () => {
  it("registra disponibilidade da Parte e lista", async () => {
    const parteId = await criarOrganizacao();
    const disp = await request(app).post("/v1/disponibilidades").send({
      parte_id: parteId,
      tipo_disponibilidade_codigo: "disponivel",
      data_inicio: "2026-08-01T00:00:00Z",
      data_fim: "2026-08-31T00:00:00Z",
    });
    expect(disp.status).toBe(201);

    const lista = await request(app).get(`/v1/partes/${parteId}/disponibilidades`).expect(200);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("rejeita Parte e ativo ao mesmo tempo (422)", async () => {
    const parteId = await criarOrganizacao();
    const ativo = await request(app).post(`/v1/partes/${parteId}/ativos`).send({ nome: "Espaço" }).expect(201);
    const res = await request(app).post("/v1/disponibilidades").send({
      parte_id: parteId,
      ativo_id: ativo.body.id,
      tipo_disponibilidade_codigo: "reservado",
      data_inicio: "2026-08-01T00:00:00Z",
      data_fim: "2026-08-31T00:00:00Z",
    });
    expect(res.status).toBe(422);
  });
});

describe("RF015 · Artistas", () => {
  it("registra representação, turnê com evento, Big Moment e agenda", async () => {
    const pessoaId = await criarPessoa();
    const representanteId = await criarOrganizacao();

    await request(app)
      .post(`/v1/pessoas/${pessoaId}/representacoes`)
      .send({ representante_parte_id: representanteId, tipo_representacao: "agencia" })
      .expect(201);

    const turne = await request(app)
      .post(`/v1/pessoas/${pessoaId}/turnes`)
      .send({ nome: "Turnê 2026", data_inicio: "2026-09-01", data_fim: "2026-12-01" })
      .expect(201);
    await request(app).post(`/v1/turnes/${turne.body.id}/eventos`).send({ cidade: "São Paulo", data_evento: "2026-09-15" }).expect(201);
    const eventos = await request(app).get(`/v1/turnes/${turne.body.id}/eventos`).expect(200);
    expect(eventos.body.itens).toHaveLength(1);

    await request(app).post(`/v1/pessoas/${pessoaId}/big-moments`).send({ titulo: "Novo álbum", data_prevista: "2026-10-01" }).expect(201);
    await request(app).post(`/v1/pessoas/${pessoaId}/agenda`).send({ titulo: "Show especial", data_inicio: "2026-11-20T21:00:00Z" }).expect(201);

    const bigs = await request(app).get(`/v1/pessoas/${pessoaId}/big-moments`).expect(200);
    expect(bigs.body.itens).toHaveLength(1);
  });

  it("bloqueia artista-info para uma organização (404 — não é pessoa)", async () => {
    const orgId = await criarOrganizacao();
    await request(app).post(`/v1/pessoas/${orgId}/turnes`).send({ nome: "X" }).expect(404);
  });
});
