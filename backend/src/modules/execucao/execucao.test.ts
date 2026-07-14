import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Execução — plano, etapas, entregas, reuniões, touchpoints e pendências (RF038–RF042)

let seq = 0;
const unico = () => `${Date.now()}.${seq++}`;

async function criarParte(nome = `Parceiro ${unico()}`): Promise<string> {
  const res = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  return res.body.id as string;
}

/** Cadeia completa até a parceria formalizada (pré-requisito da execução). */
async function criarParceria(): Promise<string> {
  const marcaId = await criarParte(`Marca ${unico()}`);
  const cliente = await request(app).post("/v1/clientes").send({ parte_id: marcaId }).expect(201);
  const projeto = await request(app)
    .post("/v1/projetos")
    .send({ cliente_cross_id: cliente.body.id, nome: "Projeto", objetivo: "Parcerias" })
    .expect(201);
  const frente = await request(app)
    .post(`/v1/projetos/${projeto.body.id}/frentes`)
    .send({ nome: "Frente", objetivo: "Objetivo" })
    .expect(201);
  const parceiroId = await criarParte();
  const cand = await request(app)
    .post(`/v1/frentes/${frente.body.id}/candidaturas`)
    .send({ parte_id: parceiroId })
    .expect(201);

  const paper = await request(app)
    .post(`/v1/frentes/${frente.body.id}/papers`)
    .send({ titulo: "Paper" })
    .expect(201);
  const versao = await request(app)
    .post(`/v1/papers/${paper.body.id}/versoes`)
    .send({ estrategia_proposta: "Co-branding" })
    .expect(201);
  await request(app)
    .post(`/v1/versoes-paper/${versao.body.id}/validacoes`)
    .send({ tipo_validacao_codigo: "cliente", status_validacao_codigo: "aprovada" })
    .expect(201);
  await request(app)
    .post(`/v1/candidaturas/${cand.body.id}/decisoes`)
    .send({ tipo_decisao_codigo: "aprovada" })
    .expect(201);

  const parceria = await request(app)
    .post(`/v1/candidaturas/${cand.body.id}/parceria`)
    .send({ tipo_parceria_codigo: "co_branding" })
    .expect(201);
  return parceria.body.id as string;
}

async function criarPlano(parceriaId: string) {
  const res = await request(app)
    .post(`/v1/parcerias/${parceriaId}/planos-execucao`)
    .send({ nome: "Plano v1" })
    .expect(201);
  return res.body as { id: string; versao: string; numero_versao: number };
}

async function criarEtapa(planoId: string, ordem = 1) {
  const res = await request(app)
    .post(`/v1/planos-execucao/${planoId}/etapas`)
    .send({ nome: `Etapa ${ordem}`, ordem })
    .expect(201);
  return res.body as { id: string; versao: string };
}

async function criarEntrega(etapaId: string) {
  const res = await request(app)
    .post(`/v1/etapas/${etapaId}/entregas`)
    .send({ nome: "Peça de campanha", data_prevista: "2026-09-01" })
    .expect(201);
  return res.body as { id: string; versao: string };
}

describe("Plano de execução — RF038 (RN029)", () => {
  it("versiona o plano e mantém apenas um vigente por parceria", async () => {
    const parceriaId = await criarParceria();

    const v1 = await criarPlano(parceriaId);
    expect(v1.numero_versao).toBe(1);

    await request(app).post(`/v1/planos-execucao/${v1.id}/vigencia`).expect(200);

    const v2 = await criarPlano(parceriaId);
    expect(v2.numero_versao).toBe(2);
    await request(app).post(`/v1/planos-execucao/${v2.id}/vigencia`).expect(200);

    const lista = await request(app).get(`/v1/parcerias/${parceriaId}/planos-execucao`).expect(200);
    const vigentes = lista.body.itens.filter(
      (p: { status_versao: string }) => p.status_versao === "vigente"
    );
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].numero_versao).toBe(2);
  });

  it("404 ao criar plano em parceria inexistente", async () => {
    const res = await request(app)
      .post("/v1/parcerias/00000000-0000-0000-0000-000000000000/planos-execucao")
      .send({ nome: "X" });
    expect(res.status).toBe(404);
  });
});

describe("Etapas — RF039 (RN030)", () => {
  it("cria, lista em ordem, atualiza e arquiva", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);

    await criarEtapa(plano.id, 2);
    const primeira = await criarEtapa(plano.id, 1);

    const lista = await request(app).get(`/v1/planos-execucao/${plano.id}/etapas`).expect(200);
    expect(lista.body.itens.map((e: { ordem: number }) => e.ordem)).toEqual([1, 2]);

    const patch = await request(app)
      .patch(`/v1/etapas/${primeira.id}`)
      .set("If-Match", `"${primeira.versao}"`)
      .send({ status_execucao_codigo: "em_andamento" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("em_andamento");

    await request(app).delete(`/v1/etapas/${primeira.id}`).expect(204);

    const restante = await request(app).get(`/v1/planos-execucao/${plano.id}/etapas`);
    expect(restante.body.itens).toHaveLength(1);
  });

  it("rejeita data_fim_prevista anterior ao início (422 — RN030)", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);

    const res = await request(app).post(`/v1/planos-execucao/${plano.id}/etapas`).send({
      nome: "Etapa",
      ordem: 1,
      data_inicio_prevista: "2026-09-01",
      data_fim_prevista: "2026-08-01",
    });
    expect(res.status).toBe(422);
  });

  it("rejeita ordem duplicada no mesmo plano (409)", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);
    await criarEtapa(plano.id, 1);

    const res = await request(app)
      .post(`/v1/planos-execucao/${plano.id}/etapas`)
      .send({ nome: "Outra", ordem: 1 });
    expect(res.status).toBe(409);
  });
});

describe("Entregas e responsáveis — RF040 (RN031)", () => {
  it("cria a entrega, registra a data de entrega e atribui responsável externo", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);
    const etapa = await criarEtapa(plano.id);
    const entrega = await criarEntrega(etapa.id);

    const patch = await request(app)
      .patch(`/v1/entregas/${entrega.id}`)
      .set("If-Match", `"${entrega.versao}"`)
      .send({ status_entrega_codigo: "entregue", data_entrega: "2026-08-28" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("entregue");

    const parteId = await criarParte();
    const resp = await request(app)
      .post(`/v1/entregas/${entrega.id}/responsaveis`)
      .send({ parte_id: parteId, funcao: "Produção" });
    expect(resp.status).toBe(201);
    expect(resp.body.itens).toHaveLength(1);

    const obtida = await request(app).get(`/v1/entregas/${entrega.id}`).expect(200);
    expect(obtida.body.responsaveis).toHaveLength(1);

    await request(app)
      .delete(`/v1/entregas/${entrega.id}/responsaveis/${resp.body.itens[0].id}`)
      .expect(204);
  });

  it("rejeita responsável interno e externo ao mesmo tempo (422 — RN031)", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);
    const etapa = await criarEtapa(plano.id);
    const entrega = await criarEntrega(etapa.id);
    const parteId = await criarParte();

    const res = await request(app)
      .post(`/v1/entregas/${entrega.id}/responsaveis`)
      .send({ parte_id: parteId, usuario_interno_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(422);
  });

  it("rejeita responsável sem nenhum dos dois lados (422 — RN031)", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);
    const etapa = await criarEtapa(plano.id);
    const entrega = await criarEntrega(etapa.id);

    const res = await request(app)
      .post(`/v1/entregas/${entrega.id}/responsaveis`)
      .send({ funcao: "Sem responsável" });
    expect(res.status).toBe(422);
  });
});

describe("Reuniões e touchpoints — RF041", () => {
  it("registra a reunião, adiciona participante e grava o resumo", async () => {
    const parceriaId = await criarParceria();

    const reuniao = await request(app)
      .post(`/v1/parcerias/${parceriaId}/reunioes`)
      .send({ titulo: "Kickoff", data_reuniao: "2026-08-05T14:00:00Z", local: "Online" });
    expect(reuniao.status).toBe(201);

    const parteId = await criarParte();
    const part = await request(app)
      .post(`/v1/reunioes/${reuniao.body.id}/participantes`)
      .send({ parte_id: parteId, papel: "Convidado" });
    expect(part.status).toBe(201);
    expect(part.body.itens).toHaveLength(1);

    const patch = await request(app)
      .patch(`/v1/reunioes/${reuniao.body.id}`)
      .set("If-Match", `"${reuniao.body.versao}"`)
      .send({ resumo: "Alinhamento de escopo concluído" });
    expect(patch.status).toBe(200);
    expect(patch.body.resumo).toBe("Alinhamento de escopo concluído");

    await request(app)
      .delete(`/v1/reunioes/${reuniao.body.id}/participantes/${part.body.itens[0].id}`)
      .expect(204);
  });

  it("registra touchpoints na linha do tempo da parceria", async () => {
    const parceriaId = await criarParceria();

    await request(app)
      .post(`/v1/parcerias/${parceriaId}/touchpoints`)
      .send({ tipo: "email", descricao: "Envio da proposta" })
      .expect(201);
    await request(app)
      .post(`/v1/parcerias/${parceriaId}/touchpoints`)
      .send({ tipo: "call", descricao: "Follow-up" })
      .expect(201);

    const lista = await request(app).get(`/v1/parcerias/${parceriaId}/touchpoints`).expect(200);
    expect(lista.body.itens).toHaveLength(2);
  });
});

describe("Pendências — RF042 (RN032)", () => {
  it("abre a pendência vinculada à entrega, filtra por status e resolve", async () => {
    const parceriaId = await criarParceria();
    const plano = await criarPlano(parceriaId);
    const etapa = await criarEtapa(plano.id);
    const entrega = await criarEntrega(etapa.id);

    const pend = await request(app)
      .post(`/v1/parcerias/${parceriaId}/pendencias`)
      .send({
        descricao: "Falta aprovação jurídica da peça",
        entrega_id: entrega.id,
        prazo: "2026-08-20",
      });
    expect(pend.status).toBe(201);
    expect(pend.body.status).toBe("aberta");
    expect(pend.body.entrega_id).toBe(entrega.id);

    const abertas = await request(app).get(`/v1/parcerias/${parceriaId}/pendencias?status=aberta`);
    expect(abertas.body.itens).toHaveLength(1);

    const patch = await request(app)
      .patch(`/v1/pendencias/${pend.body.id}`)
      .set("If-Match", `"${pend.body.versao}"`)
      .send({ status_pendencia_codigo: "resolvida" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("resolvida");

    const aindaAbertas = await request(app).get(`/v1/parcerias/${parceriaId}/pendencias?status=aberta`);
    expect(aindaAbertas.body.itens).toHaveLength(0);
  });

  it("404 quando a entrega vinculada não existe", async () => {
    const parceriaId = await criarParceria();
    const res = await request(app)
      .post(`/v1/parcerias/${parceriaId}/pendencias`)
      .send({ descricao: "X", entrega_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });
});
