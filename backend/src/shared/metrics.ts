import { RequestHandler } from "express";

type Chave = `${string}:${number}`;
const requisicoes = new Map<Chave, number>();
const duracaoMs = new Map<string, { quantidade: number; total: number }>();
const inicio = Date.now();

function rota(req: Parameters<RequestHandler>[0]): string {
  return req.route?.path ? `${req.baseUrl}${req.route.path}` : "desconhecida";
}

/** Métricas agregadas, sem URL, IP, usuário ou outro dado pessoal. */
export const coletarMetricas: RequestHandler = (req, res, next) => {
  const comeco = performance.now();
  res.on("finish", () => {
    const nome = rota(req);
    const chave: Chave = `${req.method}:${res.statusCode}`;
    requisicoes.set(chave, (requisicoes.get(chave) ?? 0) + 1);
    const atual = duracaoMs.get(nome) ?? { quantidade: 0, total: 0 };
    atual.quantidade += 1;
    atual.total += performance.now() - comeco;
    duracaoMs.set(nome, atual);
  });
  next();
};

export function metricasPrometheus(): string {
  const linhas = [
    "# HELP cross_uptime_seconds Tempo desde a inicialização da API.",
    "# TYPE cross_uptime_seconds gauge",
    `cross_uptime_seconds ${Math.floor((Date.now() - inicio) / 1000)}`,
    "# HELP cross_http_requests_total Requisições HTTP agregadas por método e status.",
    "# TYPE cross_http_requests_total counter",
  ];
  for (const [chave, total] of requisicoes) {
    const [metodo, status] = chave.split(":");
    linhas.push(`cross_http_requests_total{method="${metodo}",status="${status}"} ${total}`);
  }
  linhas.push("# HELP cross_http_route_duration_ms Duração média por rota.", "# TYPE cross_http_route_duration_ms gauge");
  for (const [nome, dados] of duracaoMs) {
    const seguro = nome.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    linhas.push(`cross_http_route_duration_ms{route="${seguro}"} ${(dados.total / dados.quantidade).toFixed(3)}`);
  }
  return `${linhas.join("\n")}\n`;
}
