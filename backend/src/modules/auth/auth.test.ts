import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

// Autenticação e autorização (RF001)

let seq = 0;
const unico = () => `${Date.now()}.${seq++}`;

/** Cria um usuário com senha e persona (usa o bypass de teste = admin). */
async function criarUsuario(persona = "estrategista", senha = "SenhaForte123") {
  const email = `user.${unico()}@cross.test`;
  const res = await request(app)
    .post("/v1/usuarios")
    .send({ nome: "Fulano", email, persona, senha })
    .expect(201);
  return { id: res.body.id as string, email, senha, persona };
}

async function login(email: string, senha: string) {
  return request(app).post("/v1/auth/login").send({ email, senha });
}

describe("Login (RF001)", () => {
  it("autentica com credenciais válidas e retorna access + refresh", async () => {
    const u = await criarUsuario();
    const res = await login(u.email, u.senha);
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.usuario.persona).toBe("estrategista");
    expect(res.body.usuario).not.toHaveProperty("senha");
  });

  it("rejeita senha errada e e-mail inexistente com 401 genérico", async () => {
    const u = await criarUsuario();
    expect((await login(u.email, "SenhaErrada999")).status).toBe(401);
    expect((await login(`naoexiste.${unico()}@cross.test`, "qualquer12345")).status).toBe(401);
  });

  it("rejeita usuário inativo (401)", async () => {
    const u = await criarUsuario();
    const usuario = await request(app).get(`/v1/usuarios/${u.id}`).expect(200);
    await request(app)
      .patch(`/v1/usuarios/${u.id}`)
      .set("If-Match", `"${usuario.body.versao}"`)
      .send({ ativo: false })
      .expect(200);
    expect((await login(u.email, u.senha)).status).toBe(401);
  });
});

describe("Sessão e enforcement (RF001)", () => {
  it("GET /auth/sessao exige token válido", async () => {
    const u = await criarUsuario();
    const { body } = await login(u.email, u.senha);

    const ok = await request(app).get("/v1/auth/sessao").set("Authorization", `Bearer ${body.access_token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(u.email);

    const ruim = await request(app).get("/v1/auth/sessao").set("Authorization", "Bearer token.invalido.aqui");
    expect(ruim.status).toBe(401);
  });

  it("token inválido é rejeitado em rota protegida (401)", async () => {
    const res = await request(app).get("/v1/partes").set("Authorization", "Bearer xxx.yyy.zzz");
    expect(res.status).toBe(401);
  });

  it("persona insuficiente recebe 403; adequada passa", async () => {
    const estrategista = await criarUsuario("estrategista");
    const { body } = await login(estrategista.email, estrategista.senha);
    const token = body.access_token as string;

    // Rota só de administrador → 403 para estrategista
    const proibido = await request(app)
      .post("/v1/usuarios")
      .set("Authorization", `Bearer ${token}`)
      .send({ nome: "X", email: `x.${unico()}@cross.test` });
    expect(proibido.status).toBe(403);

    // Rota de leitura (qualquer autenticado) → 200
    const permitido = await request(app).get("/v1/partes").set("Authorization", `Bearer ${token}`);
    expect(permitido.status).toBe(200);
  });
});

describe("Refresh com rotação e detecção de reúso (RF001)", () => {
  it("renova o par de tokens e invalida o refresh anterior", async () => {
    const u = await criarUsuario();
    const { body } = await login(u.email, u.senha);
    const refresh1 = body.refresh_token as string;

    const r1 = await request(app).post("/v1/auth/refresh").send({ refresh_token: refresh1 });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(refresh1);

    // Reusar o refresh antigo (já rotacionado) → 401 e revoga tudo
    const reuso = await request(app).post("/v1/auth/refresh").send({ refresh_token: refresh1 });
    expect(reuso.status).toBe(401);

    // O refresh novo também foi invalidado pela detecção de reúso
    const r2 = await request(app).post("/v1/auth/refresh").send({ refresh_token: r1.body.refresh_token });
    expect(r2.status).toBe(401);
  });

  it("logout revoga a sessão do refresh informado", async () => {
    const u = await criarUsuario();
    const { body } = await login(u.email, u.senha);

    await request(app).post("/v1/auth/logout").send({ refresh_token: body.refresh_token }).expect(204);
    const res = await request(app).post("/v1/auth/refresh").send({ refresh_token: body.refresh_token });
    expect(res.status).toBe(401);
  });

  it("trocar a senha revoga as sessões abertas", async () => {
    const u = await criarUsuario();
    const { body } = await login(u.email, u.senha);

    await request(app).put(`/v1/usuarios/${u.id}/senha`).send({ senha: "NovaSenha456" }).expect(204);

    const res = await request(app).post("/v1/auth/refresh").send({ refresh_token: body.refresh_token });
    expect(res.status).toBe(401);
  });
});

describe("Logout global (RF001)", () => {
  it("revoga todas as sessões do usuário autenticado", async () => {
    const u = await criarUsuario();
    const s1 = (await login(u.email, u.senha)).body;
    const s2 = (await login(u.email, u.senha)).body;

    const res = await request(app)
      .post("/v1/auth/logout-todos")
      .set("Authorization", `Bearer ${s1.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.sessoes_revogadas).toBeGreaterThanOrEqual(2);

    // Nenhum dos refresh tokens continua válido
    expect((await request(app).post("/v1/auth/refresh").send({ refresh_token: s1.refresh_token })).status).toBe(401);
    expect((await request(app).post("/v1/auth/refresh").send({ refresh_token: s2.refresh_token })).status).toBe(401);
  });
});

describe("Política de senha", () => {
  it("rejeita senha fraca ao criar usuário (422)", async () => {
    const res = await request(app)
      .post("/v1/usuarios")
      .send({ nome: "Fraco", email: `fraco.${unico()}@cross.test`, senha: "curta" });
    expect(res.status).toBe(422);
  });
});
