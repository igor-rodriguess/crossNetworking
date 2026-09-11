import { describe, expect, it } from "vitest";
import {
  avaliarFonte,
  avaliarRelevanciaPreScrape,
  contemPiiIncidental,
  detectarAnuncio,
  ehDominioOficial,
  extrairDataPublicacao,
  validarConteudoPosScrape,
} from "./qualidade-fonte";

// -----------------------------------------------------------------------------
// Qualidade de fonte e segurança de identidade — Sprint AI-02.2.
//
// As URLs e casos abaixo vêm da BASELINE REAL da AI-02.1
// (raw/research-evidence-live-baseline/). Não são inventados: são exatamente os
// dados que passaram pelos defeitos.
// -----------------------------------------------------------------------------

// URL real de anúncio capturada na baseline (truncada; sinais preservados).
const URL_ANUNCIO_REAL =
  "https://duckduckgo.com/y.js?ad_domain=mercadolivre.com.br&ad_provider=bingv7aa" +
  "&ad_type=txad&click_metadata=Q9Q1prsJxIn3bXps&rut=f4db7bc7ee54f315";

describe("Filtro de anúncios", () => {
  it("detecta o anúncio real que passou na baseline", () => {
    const d = detectarAnuncio(URL_ANUNCIO_REAL, "Converse Anuncio - Frete Grátis - Mercado Livre");
    expect(d.ehAnuncio).toBe(true);
    expect(d.sinais).toContain("redirecionador_de_anuncio");
    expect(d.sinais).toContain("parametro_ad_domain");
    expect(d.sinais).toContain("dominio_do_buscador_como_fonte");
  });

  it("detecta redirecionador do Bing Ads", () => {
    expect(detectarAnuncio("https://www.bing.com/aclick?ld=e84TXI&u=aHR0cHM").ehAnuncio).toBe(true);
  });

  it("NÃO bloqueia resultado editorial legítimo", () => {
    for (const url of [
      "https://bloomberglinea.com.br/negocios/converse-nike",
      "https://www.converse.com.br/lancamentos",
      "https://fashionunited.com.br/noticias/converse",
    ]) {
      expect(detectarAnuncio(url).ehAnuncio).toBe(false);
    }
  });

  it("anúncio recebe classificação própria e score zero", () => {
    const a = avaliarFonte({ url: URL_ANUNCIO_REAL, titulo: "Converse Anuncio" });
    expect(a.classificacao).toBe("anuncio");
    expect(a.score).toBe(0);
  });
});

describe("Domínio oficial", () => {
  it("reconhece o domínio e seus subdomínios", () => {
    expect(ehDominioOficial("converse.com", "https://www.converse.com")).toBe(true);
    expect(ehDominioOficial("news.converse.com", "https://www.converse.com")).toBe(true);
    expect(ehDominioOficial("newsroom.converse.com", "converse.com")).toBe(true);
  });

  it("reconhece variação de país — o caso que falhou na baseline", () => {
    // A baseline informou site_oficial=converse.com e o resultado veio de
    // converse.com.br; o agente não reconheceu como oficial.
    expect(ehDominioOficial("converse.com.br", "https://www.converse.com")).toBe(true);
  });

  it("NÃO aceita domínio que apenas contém o nome", () => {
    expect(ehDominioOficial("converse-blog.com", "https://www.converse.com")).toBe(false);
    expect(ehDominioOficial("fake-converse.net", "https://www.converse.com")).toBe(false);
  });
});

describe("Credibilidade discriminante", () => {
  it("separa oficial, imprensa, setorial, agregador e baixa autoridade", () => {
    const casos = [
      { url: "https://www.converse.com.br/lancamentos", oficial: "https://www.converse.com", esperado: "oficial" },
      { url: "https://bloomberglinea.com.br/negocios/x", esperado: "imprensa_reconhecida" },
      { url: "https://fashionunited.com.br/noticias/y", esperado: "imprensa_especializada" },
      { url: "https://medium.com/@alguem/post", esperado: "agregador" },
      { url: "http://qualquer.blogspot.com/post", esperado: "baixa_autoridade" },
      { url: URL_ANUNCIO_REAL, esperado: "anuncio" },
    ] as const;

    const scores = new Set<number>();
    for (const c of casos) {
      const a = avaliarFonte({ url: c.url, siteOficial: "oficial" in c ? c.oficial : undefined });
      expect(a.classificacao).toBe(c.esperado);
      scores.add(a.score);
    }
    // O defeito da baseline era exatamente este: todos com score 58.
    expect(scores.size).toBeGreaterThanOrEqual(5);
  });

  it("site oficial supera imprensa, que supera agregador e blog", () => {
    const oficial = avaliarFonte({ url: "https://www.converse.com.br/x", siteOficial: "converse.com" });
    const imprensa = avaliarFonte({ url: "https://exame.com/x" });
    const agregador = avaliarFonte({ url: "https://medium.com/x" });
    const blog = avaliarFonte({ url: "http://x.blogspot.com/y" });

    expect(oficial.score).toBeGreaterThan(imprensa.score);
    expect(imprensa.score).toBeGreaterThan(agregador.score);
    expect(agregador.score).toBeGreaterThan(blog.score);
  });

  it("toda avaliação explica o porquê", () => {
    const a = avaliarFonte({ url: "https://bloomberglinea.com.br/x" });
    expect(a.sinais.length).toBeGreaterThan(0);
    expect(a.sinais).toContain("veiculo_de_imprensa_reconhecido");
  });

  it("domínio desconhecido não passa no gate de 70", () => {
    const a = avaliarFonte({ url: "https://portalpopcyber.com/converse" });
    expect(a.score).toBeLessThan(70);
    expect(a.sinais).toContain("dominio_nao_reconhecido");
  });
});

// -----------------------------------------------------------------------------
// Qualificação editorial por sinais.
//
// A lista fechada de veículos era o teto real da pesquisa: numa execução contra
// a Converse, 24 dos 40 descartes foram `dominio_nao_reconhecido` — todos com o
// mesmo score 50 — e o objetivo `territorios_atuacao` terminou com ZERO fontes.
// As URLs abaixo são as reais dessa execução.
// -----------------------------------------------------------------------------
describe("Qualificação editorial de domínio não catalogado", () => {
  it("admite matéria analítica sobre subculturas e collabs", () => {
    // Conteúdo de público e ativos — exatamente o que o Crossability precisa —
    // barrado antes só por não ter "/noticias/" na URL.
    const a = avaliarFonte({
      url: "https://www.farfetch.com/br/style-guide/trends-subcultures/as-melhores-colaboracoes",
    });
    expect(a.classificacao).toBe("imprensa_especializada");
    expect(a.sinais).toContain("veiculo_editorial_por_sinais");
  });

  it("veículo não catalogado nunca supera um curado", () => {
    const naoCatalogado = avaliarFonte({
      url: "https://www.farfetch.com/br/style-guide/trends-subcultures/x",
    });
    const curado = avaliarFonte({ url: "https://fashionunited.com.br/noticias/y" });
    const referencia = avaliarFonte({ url: "https://bloomberg.com/news/z" });

    expect(naoCatalogado.score).toBeLessThan(curado.score);
    expect(curado.score).toBeLessThan(referencia.score);
  });

  it("repositório acadêmico e rede social não viram fonte editorial", () => {
    // Um SWOT de estudante tem a mesma aparência estrutural de análise setorial;
    // barrar por natureza é mais honesto do que tentar pontuar a diferença.
    const casos = [
      "https://pt.scribd.com/document/352353438/4-Analise-SWOT-All-Star",
      "https://www.studocu.com/pt/document/universidade-lusiada-de-lisboa/gestao",
      "https://dspace.mackenzie.br/items/2c2a58f4",
      "https://pt.wikipedia.org/wiki/Converse_(empresa)",
      "https://www.instagram.com/converse/",
      "https://www.glassdoor.com.br/Entrevista/Converse-E3754.htm",
      "https://www.webartigos.com/artigos/as-marcas-e-seu-significado",
    ];

    for (const url of casos) {
      const a = avaliarFonte({ url });
      expect(a.classificacao).toBe("baixa_autoridade");
      expect(a.sinais).toContain("nao_editorial_por_natureza");
    }
  });

  it("nome de veículo sozinho não qualifica", () => {
    // "revista" no domínio soma, mas sem seção editorial não alcança o bar.
    const a = avaliarFonte({ url: "https://revistaqualquer.com/" });
    expect(a.classificacao).toBe("baixa_autoridade");
  });
});

describe("Entity Resolution pré-scrape — regressão Reserva", () => {
  it("bloqueia os dicionários reais que a baseline raspou", () => {
    // URLs exatas da baseline do caso C.
    const casos = [
      { url: "https://www.spanishdict.com/translate/reserva", titulo: "Reserva | Spanish to English Translation" },
      { url: "https://www.collinsdictionary.com/us/dictionary/spanish-english/reserva", titulo: "Spanish-English Dictionary" },
    ];

    for (const c of casos) {
      const r = avaliarRelevanciaPreScrape({
        titulo: c.titulo,
        url: c.url,
        entidade: "Reserva",
        aliases: ["Reserva moda"],
      });
      expect(r.relevante).toBe(false);
      expect(r.motivo).toBe("conteudo_lexicografico");
    }
  });

  it("permite o site real da marca", () => {
    const r = avaliarRelevanciaPreScrape({
      titulo: "Reserva | Loja Oficial",
      url: "https://reserva.is/",
      snippet: "Coleção nova da marca. Compre online.",
      entidade: "Reserva",
    });
    expect(r.relevante).toBe(true);
  });

  it("menção ao nome sem contexto de organização não basta", () => {
    const r = avaliarRelevanciaPreScrape({
      titulo: "Fiz uma reserva no restaurante ontem",
      url: "https://blogpessoal.exemplo.com/post",
      snippet: "Contei como foi a noite.",
      entidade: "Reserva",
    });
    expect(r.relevante).toBe(false);
    expect(r.motivo).toBe("sem_contexto_organizacional");
  });

  it("domínio oficial dispensa outros sinais", () => {
    const r = avaliarRelevanciaPreScrape({
      titulo: "Página inicial",
      url: "https://www.converse.com.br/",
      entidade: "Converse",
      siteOficial: "https://www.converse.com",
    });
    expect(r.relevante).toBe(true);
    expect(r.sinais).toContain("dominio_oficial_da_entidade");
  });
});

describe("Validação pós-scrape", () => {
  it("rejeita conteúdo de dicionário mesmo com o nome presente", () => {
    // Trechos reais extraídos da baseline (spanishdict.com).
    const markdown = `
      reserva - Translation and conjugation
      Affirmative imperative tú conjugation of reservar.
      Compruebe si su reserva ha sido confirmada por nuestro proveedor.
      See the dictionary definition and synonyms below.
    `;
    const v = validarConteudoPosScrape({
      markdown,
      entidade: "Reserva",
      url: "https://www.spanishdict.com/translate/reserva",
    });
    expect(v.valido).toBe(false);
    expect(v.motivo).toBe("conteudo_lexicografico");
  });

  it("aceita conteúdo institucional real", () => {
    const markdown = `
      A Reserva é uma marca brasileira de moda fundada em 2005.
      A empresa lançou sua nova coleção de verão nas lojas do país.
      A Reserva mantém parceria com produtores locais e opera no varejo.
    `;
    const v = validarConteudoPosScrape({ markdown, entidade: "Reserva", url: "https://reserva.is/" });
    expect(v.valido).toBe(true);
  });

  it("rejeita página que não menciona a entidade", () => {
    const v = validarConteudoPosScrape({
      markdown: "Texto institucional de outra empresa, sobre outro assunto de negócio.",
      entidade: "Converse",
      url: "https://exemplo.com/x",
    });
    expect(v.valido).toBe(false);
    expect(v.motivo).toBe("sem_mencao_a_entidade");
  });
});

describe("PII incidental", () => {
  it("barra a frase real com e-mail de terceiro que virou Evidence na baseline", () => {
    const frase = "Envía un mail a irene@yogadurga.es confirmando tu reserva y asistencia.";
    const p = contemPiiIncidental(frase);
    expect(p.contem).toBe(true);
    expect(p.tipo).toBe("email");
  });

  it("detecta CPF e telefone", () => {
    expect(contemPiiIncidental("Documento 123.456.789-00 do cliente.").tipo).toBe("cpf");
    expect(contemPiiIncidental("Ligue para (11) 98765-4321 agora.").tipo).toBe("telefone");
  });

  it("não barra frase factual normal", () => {
    expect(contemPiiIncidental("A marca lançou uma coleção cápsula em São Paulo.").contem).toBe(false);
  });
});

describe("published_at a partir de metadata", () => {
  it("extrai de JSON-LD", () => {
    const d = extrairDataPublicacao('{"@type":"Article","datePublished":"2026-03-15T10:00:00Z"}');
    expect(d.publicadoEm).toContain("2026-03-15");
    expect(d.origem).toBe("json_ld");
  });

  it("extrai de OpenGraph", () => {
    const d = extrairDataPublicacao('<meta property="article:published_time" content="2026-02-01T08:30:00Z">');
    expect(d.publicadoEm).toContain("2026-02-01");
    expect(d.origem).toBe("open_graph");
  });

  it("extrai da metadata do Firecrawl", () => {
    const d = extrairDataPublicacao("", { publishedTime: "2026-01-10T12:00:00Z" });
    expect(d.publicadoEm).toContain("2026-01-10");
    expect(d.origem).toBe("firecrawl_metadata");
  });

  it("devolve null quando não há data — nunca inventa", () => {
    const d = extrairDataPublicacao("Página sem qualquer metadata de data.");
    expect(d.publicadoEm).toBeNull();
    expect(d.origem).toBe("desconhecida");
  });

  it("rejeita data inválida e data futura", () => {
    expect(extrairDataPublicacao('{"datePublished":"não é data"}').publicadoEm).toBeNull();
    const futuro = new Date(Date.now() + 90 * 86_400_000).toISOString();
    expect(extrairDataPublicacao(`{"datePublished":"${futuro}"}`).publicadoEm).toBeNull();
  });
});
