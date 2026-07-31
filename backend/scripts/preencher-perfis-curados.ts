import { Client } from "pg";
import { env } from "../src/config/env";

type Perfil = { nome: string; resumo: string; posicionamento: string; territorios: string[]; publicos: string[]; pracas: string[]; ativos: string[] };

const perfis: Perfil[] = [
  { nome: "ADCOS", resumo: "A ADCOS é uma marca brasileira de dermocosméticos, com mais de 30 anos de atuação em cuidados com a pele. Seu portfólio reúne soluções para fotoproteção e tratamentos facial, corporal e capilar, desenvolvidas para as necessidades da pele brasileira.", posicionamento: "Dermocosméticos brasileiros com foco em ciência, tecnologia, eficácia e cuidados com a pele.", territorios: ["Skincare", "Dermocosméticos", "Fotoproteção", "Saúde e beleza"], publicos: ["Pessoas interessadas em cuidados com a pele", "Consumidores de fotoproteção", "Homens interessados em skincare"], pracas: ["Brasil"], ativos: ["Portfólio de dermocosméticos", "Linha de fotoproteção", "Loja e e-commerce oficial"] },
  { nome: "ALIFE NINO", resumo: "A Alife Nino é uma operação de gastronomia e hospitalidade ligada ao Grupo Alife Nino. A marca Nino Cucina apresenta uma experiência de cozinha italiana, com menu assinado, vinhos, reservas, delivery e unidades físicas.", posicionamento: "Experiência gastronômica italiana com foco em técnica, tradição, ingredientes e hospitalidade.", territorios: ["Gastronomia", "Hospitalidade", "Experiências à mesa", "Cultura italiana"], publicos: ["Consumidores de gastronomia", "Público interessado em experiências premium", "Apreciadores de vinhos e culinária italiana"], pracas: ["São Paulo"], ativos: ["Restaurantes e unidades físicas", "Experiências gastronômicas", "Eventos com chefs convidados", "Delivery"] },
  { nome: "ARCANJOS", resumo: "A Arcanjs Parfum Home atua com perfumaria para ambientes e itens de bem-estar para a casa. Seu e-commerce apresenta águas perfumadas, difusores de aromas, fragrâncias, home sprays, kits especiais, refis e sabonetes.", posicionamento: "Perfumaria para casa orientada à criação de ambientes acolhedores por meio de fragrâncias e presentes.", territorios: ["Casa e decoração", "Perfumaria para ambientes", "Bem-estar", "Presentes"], publicos: ["Consumidores interessados em casa e decoração", "Pessoas que buscam fragrâncias para ambientes", "Compradores de presentes"], pracas: ["São Paulo", "Brasil"], ativos: ["E-commerce", "Águas perfumadas", "Difusores de aromas", "Home sprays", "Kits especiais"] },
  { nome: "ATIVVE", resumo: "A Ativve é uma marca de dermocosméticos voltada a rotinas de skincare. A marca comunica o uso de ativos de alta performance em sequências de limpeza e tratamento para o dia e a noite.", posicionamento: "Skincare de rotina com ativos de alta performance e foco em tratamento da pele.", territorios: ["Skincare", "Dermocosméticos", "Saúde e beleza"], publicos: ["Pessoas interessadas em skincare", "Consumidores de produtos para rotina de cuidados com a pele"], pracas: ["Brasil"], ativos: ["E-commerce", "Rotinas de skincare", "Produtos de limpeza e tratamento"] },
];

async function catalogo(client: Client, tabela: "territorio" | "publico" | "praca", nome: string): Promise<string> {
  const existente = await client.query(`SELECT id FROM cross_intelligence.${tabela} WHERE lower(nome) = lower($1) LIMIT 1`, [nome]);
  if (existente.rows[0]) return existente.rows[0].id;
  if (tabela === "territorio") {
    const codigo = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return (await client.query("INSERT INTO cross_intelligence.territorio (codigo,nome) VALUES ($1,$2) RETURNING id", [codigo, nome])).rows[0].id;
  }
  if (tabela === "publico") return (await client.query("INSERT INTO cross_intelligence.publico (nome) VALUES ($1) RETURNING id", [nome])).rows[0].id;
  return (await client.query("INSERT INTO cross_intelligence.praca (nome,pais) VALUES ($1,'Brasil') RETURNING id", [nome])).rows[0].id;
}

async function vincular(client: Client, tabela: "territorio" | "publico" | "praca", parteId: string, nome: string) {
  const id = await catalogo(client, tabela, nome);
  const coluna = `${tabela}_id`;
  await client.query(`INSERT INTO cross_intelligence.parte_${tabela} (parte_id,${coluna}) SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM cross_intelligence.parte_${tabela} WHERE parte_id=$1 AND ${coluna}=$2 AND arquivado_em IS NULL)`, [parteId, id]);
}

async function executar() {
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  for (const perfil of perfis) {
    await client.query("BEGIN");
    try {
      const parte = (await client.query("SELECT id FROM cross_core.parte WHERE lower(nome_exibicao)=lower($1) AND arquivado_em IS NULL", [perfil.nome])).rows[0];
      if (!parte) throw new Error(`Parte não encontrada: ${perfil.nome}`);
      await client.query("UPDATE cross_intelligence.perfil_estrategico SET status_versao='substituida',vigente_ate=NOW() WHERE parte_id=$1 AND status_versao='vigente' AND arquivado_em IS NULL", [parte.id]);
      await client.query("INSERT INTO cross_intelligence.perfil_estrategico (parte_id,numero_versao,resumo,posicionamento,status_versao,vigente_desde) SELECT $1,COALESCE(MAX(numero_versao),0)+1,$2,$3,'vigente',NOW() FROM cross_intelligence.perfil_estrategico WHERE parte_id=$1", [parte.id, perfil.resumo, perfil.posicionamento]);
      for (const nome of perfil.territorios) await vincular(client, "territorio", parte.id, nome);
      for (const nome of perfil.publicos) await vincular(client, "publico", parte.id, nome);
      for (const nome of perfil.pracas) await vincular(client, "praca", parte.id, nome);
      for (const nome of perfil.ativos) await client.query("INSERT INTO cross_intelligence.ativo (parte_id,nome,categoria) SELECT $1,$2::varchar,'Ativo público' WHERE NOT EXISTS (SELECT 1 FROM cross_intelligence.ativo WHERE parte_id=$1 AND lower(nome)=lower($2::varchar) AND arquivado_em IS NULL)", [parte.id, nome]);
      await client.query("COMMIT");
    } catch (erro) { await client.query("ROLLBACK"); throw erro; }
  }
  await client.end();
  console.log(`Perfis publicados: ${perfis.map((perfil) => perfil.nome).join(", ")}`);
}

void executar();
