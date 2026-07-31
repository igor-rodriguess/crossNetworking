import { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors";
import { exigirIfMatch } from "../../shared/optimistic-lock";
import { envelopePaginado, parsePaginacao } from "../../shared/pagination";
import * as service from "./clientes.service";
import {
  atualizarClienteSchema,
  atualizarContratoSchema,
  criarClienteSchema,
  criarComponenteSchema,
  criarContratoSchema,
  definirModelosSchema,
} from "./clientes.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(valor: string, mensagem: string): string {
  if (!UUID_RE.test(valor)) throw new NotFoundError(mensagem);
  return valor;
}

// --- Clientes (RF016) ------------------------------------------------------

export async function criar(req: Request, res: Response): Promise<void> {
  const input = criarClienteSchema.parse(req.body);
  const cliente = await service.criarCliente(input, req.usuarioId);
  res.setHeader("ETag", `"${cliente.versao}"`);
  res.status(201).json(cliente);
}

export async function listar(req: Request, res: Response): Promise<void> {
  const p = parsePaginacao(req.query as Record<string, unknown>);
  const buscaRaw = req.query.busca;
  const busca = typeof buscaRaw === "string" && buscaRaw.trim() ? buscaRaw.trim() : null;
  // O escopo vem do usuário autenticado, não de parâmetro da requisição.
  const { itens, total } = await service.listarClientes(
    { busca, limit: p.limit, offset: p.offset },
    req.usuario?.id ?? null
  );
  res.json(envelopePaginado(itens, total, p));
}

export async function obter(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Cliente não encontrado");
  const cliente = await service.obterCliente(id, req.usuario?.id ?? null);
  res.setHeader("ETag", `"${cliente.versao}"`);
  res.json(cliente);
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Cliente não encontrado");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarClienteSchema.parse(req.body);
  const cliente = await service.atualizarCliente(id, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${cliente.versao}"`);
  res.json(cliente);
}

export async function arquivar(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Cliente não encontrado");
  await service.arquivarCliente(id, req.usuarioId);
  res.status(204).send();
}

// --- Contratos (RF017) -----------------------------------------------------

export async function criarContrato(req: Request, res: Response): Promise<void> {
  const clienteId = exigirUuid(req.params.id, "Cliente não encontrado");
  const input = criarContratoSchema.parse(req.body);
  const contrato = await service.criarContrato(clienteId, input, req.usuarioId);
  res.setHeader("ETag", `"${contrato.versao}"`);
  res.status(201).json(contrato);
}

export async function listarContratos(req: Request, res: Response): Promise<void> {
  const clienteId = exigirUuid(req.params.id, "Cliente não encontrado");
  res.json({ itens: await service.listarContratos(clienteId) });
}

export async function obterContrato(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Contrato não encontrado");
  const contrato = await service.obterContrato(id);
  res.setHeader("ETag", `"${contrato.versao}"`);
  res.json(contrato);
}

export async function atualizarContrato(req: Request, res: Response): Promise<void> {
  const id = exigirUuid(req.params.id, "Contrato não encontrado");
  const versao = exigirIfMatch(req.header("if-match"));
  const patch = atualizarContratoSchema.parse(req.body);
  const contrato = await service.atualizarContrato(id, patch, versao, req.usuarioId);
  res.setHeader("ETag", `"${contrato.versao}"`);
  res.json(contrato);
}

// --- Modelos e componentes (RF018) -----------------------------------------

export async function definirModelos(req: Request, res: Response): Promise<void> {
  const contratoId = exigirUuid(req.params.id, "Contrato não encontrado");
  const input = definirModelosSchema.parse(req.body);
  res.json(await service.definirModelos(contratoId, input, req.usuarioId));
}

export async function adicionarComponente(req: Request, res: Response): Promise<void> {
  const contratoId = exigirUuid(req.params.id, "Contrato não encontrado");
  const input = criarComponenteSchema.parse(req.body);
  res.status(201).json(await service.adicionarComponente(contratoId, input, req.usuarioId));
}

export async function listarComponentes(req: Request, res: Response): Promise<void> {
  const contratoId = exigirUuid(req.params.id, "Contrato não encontrado");
  res.json({ itens: await service.listarComponentes(contratoId) });
}

export async function removerComponente(req: Request, res: Response): Promise<void> {
  const contratoId = exigirUuid(req.params.id, "Contrato não encontrado");
  const compId = exigirUuid(req.params.compId, "Componente não encontrado neste contrato");
  await service.removerComponente(contratoId, compId, req.usuarioId);
  res.status(204).send();
}
