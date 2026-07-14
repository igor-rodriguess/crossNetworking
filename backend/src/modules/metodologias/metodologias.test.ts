import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Metodologias — Crossability, Paper, Score Card e Decisão (RF027–RF033)

let seq = 0;
const unico = () => `${Date.now()}.${seq++}`;

async function criarParte(nome = `Parceiro ${unico()}`): Promise<string> {
  const res = await request(app)
    .post("/v1/partes")
    .send({ tipo: "organizacao", nome_exibicao: nome, organizacao: { nome_fantasia: nome } })
    .expect(201);
  return res.body.id as string;
}

/** Monta a cadeia cliente → projeto → frente e devolve o id da frente. */
async function criarFrente(): Promise<string> {
  const parteId = await criarParte(`Marca ${unico()}`);
  const cliente = await request(app).post("/v1/clientes").send({ parte_id: parteId }).expect(201);
  const projeto = await request(app)
    .post("/v1/projetos")
    .send({ cliente_cross_id: cliente.body.id, nome: "Projeto", objetivo: "Parcerias" })
    .expect(201);
  const frente = await request(app)
    .post(`/v1/projetos/${projeto.body.id}/frentes`)
    .send({ nome: "Frente", objetivo: "Objetivo" })
    .expect(201);
  return frente.body.id as string;
}

async function criarCandidatura(frenteId: string): Promise<string> {
  const parteId = await criarParte();
  const res = await request(app)
    .post(`/v1/frentes/${frenteId}/candidaturas`)
    .send({ parte_id: parteId })
    .expect(201);
  return res.body.id as string;
}

/** Paper com uma versão; opcionalmente já validada (RN020/RN022). */
async function criarPaperComVersao(frenteId: string, statusValidacao?: string) {
  const paper = await request(app)
    .post(`/v1/frentes/${frenteId}/papers`)
    .send({ titulo: "Paper de Oportunidade" })
    .expect(201);

  const versao = await request(app)
    .post(`/v1/papers/${paper.body.id}/versoes`)
    .send({ estrategia_proposta: "Co-branding de longo prazo" })
    .expect(201);

  let validacaoId: string | undefined;
  if (statusValidacao) {
    const validacao = await request(app)
      .post(`/v1/versoes-paper/${versao.body.id}/validacoes`)
      .send({ tipo_validacao_codigo: "cliente", status_validacao_codigo: statusValidacao })
      .expect(201);
    validacaoId = validacao.body.id as string;
  }
  return { paperId: paper.body.id as string, versaoId: versao.body.id as string, validacaoId };
}

/** Modelo de Score Card vigente com dois critérios de pesos conhecidos. */
async function criarModeloVigente() {
  const modelo = await request(app)
    .post("/v1/modelos-score-card")
    .send({ nome: `Cross Score Card ${unico()}` })
    .expect(201);

  const versao = await request(app)
    .post(`/v1/modelos-score-card/${modelo.body.id}/versoes`)
    .send({})
    .expect(201);

  const criterios = await request(app)
    .put(`/v1/versoes-modelo-score-card/${versao.body.id}/criterios`)
    .send({
      criterios: [
        { nome: "Aderência de público", peso_sim: 10, peso_nao: 0, ordem: 1 },
        { nome: "Complementaridade de ativos", peso_sim: 5, peso_nao: 2, ordem: 2 },
      ],
    })
    .expect(200);

  await request(app).post(`/v1/versoes-modelo-score-card/${versao.body.id}/vigencia`).expect(200);

  return {
    versaoModeloId: versao.body.id as string,
    criterios: criterios.body.itens as Array<{ id: string; nome: string }>,
  };
}

describe("Análise Crossability — RF027 (RN019)", () => {
  it("cada envio cria uma nova versão, sem sobrescrever a anterior", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);

    const v1 = await request(app)
      .post(`/v1/candidaturas/${candId}/analises-crossability`)
      .send({ sinergias: "Público jovem em comum" });
    expect(v1.status).toBe(201);
    expect(v1.body.numero_versao).toBe(1);

    const v2 = await request(app)
      .post(`/v1/candidaturas/${candId}/analises-crossability`)
      .send({ sinergias: "Revisado após reunião", status_crossability_codigo: "revisada" })
      .expect(201);
    expect(v2.body.numero_versao).toBe(2);
    expect(v2.body.status).toBe("revisada");

    const lista = await request(app).get(`/v1/candidaturas/${candId}/analises-crossability`);
    expect(lista.body.itens).toHaveLength(2);
    expect(lista.body.itens[0].numero_versao).toBe(2);

    const obtida = await request(app).get(`/v1/analises-crossability/${v1.body.id}`).expect(200);
    expect(obtida.body.sinergias).toBe("Público jovem em comum");
  });

  it("404 para candidatura inexistente", async () => {
    const res = await request(app)
      .post("/v1/candidaturas/00000000-0000-0000-0000-000000000000/analises-crossability")
      .send({ sinergias: "x" });
    expect(res.status).toBe(404);
  });
});

describe("Paper e versões — RF028 (RN021)", () => {
  it("mantém no máximo uma versão vigente por Paper", async () => {
    const frenteId = await criarFrente();
    const { paperId, versaoId } = await criarPaperComVersao(frenteId);

    const primeira = await request(app).post(`/v1/versoes-paper/${versaoId}/vigencia`).expect(200);
    expect(primeira.body.status_versao).toBe("vigente");

    const v2 = await request(app)
      .post(`/v1/papers/${paperId}/versoes`)
      .send({ estrategia_proposta: "Revisão da estratégia" })
      .expect(201);
    expect(v2.body.numero_versao).toBe(2);

    await request(app).post(`/v1/versoes-paper/${v2.body.id}/vigencia`).expect(200);

    const versoes = await request(app).get(`/v1/papers/${paperId}/versoes`).expect(200);
    const vigentes = versoes.body.itens.filter(
      (v: { status_versao: string }) => v.status_versao === "vigente"
    );
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].numero_versao).toBe(2);
  });

  it("404 ao criar Paper em frente inexistente", async () => {
    const res = await request(app)
      .post("/v1/frentes/00000000-0000-0000-0000-000000000000/papers")
      .send({ titulo: "X" });
    expect(res.status).toBe(404);
  });

  it("422 quando falta a estratégia proposta", async () => {
    const frenteId = await criarFrente();
    const paper = await request(app)
      .post(`/v1/frentes/${frenteId}/papers`)
      .send({ titulo: "Paper" })
      .expect(201);

    const res = await request(app).post(`/v1/papers/${paper.body.id}/versoes`).send({});
    expect(res.status).toBe(422);
  });
});

describe("Recomendações do Paper — RF029", () => {
  it("recomenda candidatura, reordena e remove", async () => {
    const frenteId = await criarFrente();
    const { paperId } = await criarPaperComVersao(frenteId);
    const candId = await criarCandidatura(frenteId);

    const criada = await request(app)
      .post(`/v1/papers/${paperId}/recomendacoes`)
      .send({ candidatura_parceiro_id: candId, ordem_prioridade: 1, recomendacao: "Prioritária" });
    expect(criada.status).toBe(201);
    expect(criada.body.itens).toHaveLength(1);

    // Reenvio atualiza a mesma recomendação em vez de duplicar
    const reordenada = await request(app)
      .post(`/v1/papers/${paperId}/recomendacoes`)
      .send({ candidatura_parceiro_id: candId, ordem_prioridade: 3 })
      .expect(201);
    expect(reordenada.body.itens).toHaveLength(1);
    expect(reordenada.body.itens[0].ordem_prioridade).toBe(3);

    await request(app).delete(`/v1/papers/${paperId}/recomendacoes/${candId}`).expect(204);

    const lista = await request(app).get(`/v1/papers/${paperId}/recomendacoes`).expect(200);
    expect(lista.body.itens).toHaveLength(0);
  });
});

describe("Validação do Paper — RF030 (RN020)", () => {
  it("valida uma versão específica e promove o Paper a validado", async () => {
    const frenteId = await criarFrente();
    const { paperId, versaoId } = await criarPaperComVersao(frenteId);

    const validacao = await request(app)
      .post(`/v1/versoes-paper/${versaoId}/validacoes`)
      .send({
        tipo_validacao_codigo: "cliente",
        status_validacao_codigo: "aprovada",
        observacoes: "Aprovado em comitê",
      });
    expect(validacao.status).toBe(201);
    expect(validacao.body.versao_paper_id).toBe(versaoId);
    expect(validacao.body.status).toBe("aprovada");

    const paper = await request(app).get(`/v1/papers/${paperId}`).expect(200);
    expect(paper.body.status).toBe("validado");
  });

  it("422 para tipo de validação inexistente", async () => {
    const frenteId = await criarFrente();
    const { versaoId } = await criarPaperComVersao(frenteId);
    const res = await request(app)
      .post(`/v1/versoes-paper/${versaoId}/validacoes`)
      .send({ tipo_validacao_codigo: "nao_existe", status_validacao_codigo: "aprovada" });
    expect(res.status).toBe(422);
  });
});

describe("Modelo de Score Card — RF031", () => {
  it("cria modelo, versiona, define critérios e publica", async () => {
    const { versaoModeloId, criterios } = await criarModeloVigente();
    expect(criterios).toHaveLength(2);

    const lista = await request(app)
      .get(`/v1/versoes-modelo-score-card/${versaoModeloId}/criterios`)
      .expect(200);
    expect(lista.body.itens[0].ordem).toBe(1);
  });

  it("bloqueia alteração de critérios após a publicação (RN023)", async () => {
    const { versaoModeloId } = await criarModeloVigente();

    const res = await request(app)
      .put(`/v1/versoes-modelo-score-card/${versaoModeloId}/criterios`)
      .send({ criterios: [{ nome: "Novo", peso_sim: 1, peso_nao: 0, ordem: 1 }] });
    expect(res.status).toBe(422);
  });

  it("422 para ordem duplicada entre critérios", async () => {
    const modelo = await request(app)
      .post("/v1/modelos-score-card")
      .send({ nome: `Modelo ${unico()}` })
      .expect(201);
    const versao = await request(app)
      .post(`/v1/modelos-score-card/${modelo.body.id}/versoes`)
      .send({})
      .expect(201);

    const res = await request(app)
      .put(`/v1/versoes-modelo-score-card/${versao.body.id}/criterios`)
      .send({
        criterios: [
          { nome: "A", peso_sim: 1, peso_nao: 0, ordem: 1 },
          { nome: "B", peso_sim: 1, peso_nao: 0, ordem: 1 },
        ],
      });
    expect(res.status).toBe(422);
  });

  it("422 ao publicar versão sem critérios", async () => {
    const modelo = await request(app)
      .post("/v1/modelos-score-card")
      .send({ nome: `Modelo ${unico()}` })
      .expect(201);
    const versao = await request(app)
      .post(`/v1/modelos-score-card/${modelo.body.id}/versoes`)
      .send({})
      .expect(201);

    const res = await request(app).post(`/v1/versoes-modelo-score-card/${versao.body.id}/vigencia`);
    expect(res.status).toBe(422);
  });
});

describe("Avaliação Score Card — RF032 (RN022, RN023, RN024)", () => {
  it("calcula a pontuação a partir dos pesos versionados e soma o potencial disruptivo", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const { validacaoId } = await criarPaperComVersao(frenteId, "aprovada");
    const { versaoModeloId, criterios } = await criarModeloVigente();

    // sim (peso_sim 10) + nao (peso_nao 2) + potencial 4 = 16
    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/avaliacoes-score-card`)
      .send({
        versao_modelo_score_card_id: versaoModeloId,
        validacao_paper_id: validacaoId,
        potencial_disruptivo: 4,
        respostas: [
          { criterio_id: criterios[0].id, valor: "sim" },
          { criterio_id: criterios[1].id, valor: "nao", justificativa: "Ativos sobrepostos" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.score_total).toBe(16);
    expect(res.body.respostas).toHaveLength(2);
    expect(res.body.respostas[0].pontuacao_obtida).toBe(10);
    expect(res.body.respostas[1].pontuacao_obtida).toBe(2);

    const obtida = await request(app).get(`/v1/avaliacoes-score-card/${res.body.id}`).expect(200);
    expect(obtida.body.score_total).toBe(16);

    const lista = await request(app).get(`/v1/candidaturas/${candId}/avaliacoes-score-card`);
    expect(lista.body.itens).toHaveLength(1);
  });

  it("pontua zero em critério não avaliado", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const { validacaoId } = await criarPaperComVersao(frenteId, "aprovada");
    const { versaoModeloId, criterios } = await criarModeloVigente();

    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/avaliacoes-score-card`)
      .send({
        versao_modelo_score_card_id: versaoModeloId,
        validacao_paper_id: validacaoId,
        potencial_disruptivo: 1,
        respostas: [
          { criterio_id: criterios[0].id, valor: "nao_avaliado" },
          { criterio_id: criterios[1].id, valor: "sim" },
        ],
      })
      .expect(201);
    expect(res.body.score_total).toBe(6); // 0 + 5 + 1
  });

  it("rejeita avaliação sobre validação não aprovada (422 — RN022)", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const { validacaoId } = await criarPaperComVersao(frenteId, "pendente");
    const { versaoModeloId, criterios } = await criarModeloVigente();

    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/avaliacoes-score-card`)
      .send({
        versao_modelo_score_card_id: versaoModeloId,
        validacao_paper_id: validacaoId,
        potencial_disruptivo: 3,
        respostas: criterios.map((c) => ({ criterio_id: c.id, valor: "sim" })),
      });
    expect(res.status).toBe(422);
  });

  it("rejeita duas respostas para o mesmo critério (422 — RN024)", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const { validacaoId } = await criarPaperComVersao(frenteId, "aprovada");
    const { versaoModeloId, criterios } = await criarModeloVigente();

    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/avaliacoes-score-card`)
      .send({
        versao_modelo_score_card_id: versaoModeloId,
        validacao_paper_id: validacaoId,
        potencial_disruptivo: 3,
        respostas: [
          { criterio_id: criterios[0].id, valor: "sim" },
          { criterio_id: criterios[0].id, valor: "nao" },
        ],
      });
    expect(res.status).toBe(422);
  });

  it("rejeita critério obrigatório sem resposta (422)", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const { validacaoId } = await criarPaperComVersao(frenteId, "aprovada");
    const { versaoModeloId, criterios } = await criarModeloVigente();

    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/avaliacoes-score-card`)
      .send({
        versao_modelo_score_card_id: versaoModeloId,
        validacao_paper_id: validacaoId,
        potencial_disruptivo: 3,
        respostas: [{ criterio_id: criterios[0].id, valor: "sim" }],
      });
    expect(res.status).toBe(422);
  });

  it("rejeita potencial disruptivo fora de 1..5 (422)", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const { validacaoId } = await criarPaperComVersao(frenteId, "aprovada");
    const { versaoModeloId, criterios } = await criarModeloVigente();

    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/avaliacoes-score-card`)
      .send({
        versao_modelo_score_card_id: versaoModeloId,
        validacao_paper_id: validacaoId,
        potencial_disruptivo: 9,
        respostas: criterios.map((c) => ({ criterio_id: c.id, valor: "sim" })),
      });
    expect(res.status).toBe(422);
  });
});

describe("Decisão da candidatura — RF033 (RN025)", () => {
  it("registra a decisão com justificativa e responsável, e acumula histórico", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);

    const decisao = await request(app)
      .post(`/v1/candidaturas/${candId}/decisoes`)
      .send({
        tipo_decisao_codigo: "aprovada",
        justificativa: "Score alto e fit estratégico",
        contexto: { score_total: 16 },
      });
    expect(decisao.status).toBe(201);
    expect(decisao.body.tipo).toBe("aprovada");
    expect(decisao.body.contexto).toEqual({ score_total: 16 });

    await request(app)
      .post(`/v1/candidaturas/${candId}/decisoes`)
      .send({ tipo_decisao_codigo: "stand_by", justificativa: "Aguardando orçamento" })
      .expect(201);

    const hist = await request(app).get(`/v1/candidaturas/${candId}/decisoes`).expect(200);
    expect(hist.body.itens).toHaveLength(2);
  });

  it("422 para tipo de decisão inexistente", async () => {
    const frenteId = await criarFrente();
    const candId = await criarCandidatura(frenteId);
    const res = await request(app)
      .post(`/v1/candidaturas/${candId}/decisoes`)
      .send({ tipo_decisao_codigo: "nao_existe" });
    expect(res.status).toBe(422);
  });
});
