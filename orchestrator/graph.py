from __future__ import annotations

import os
import re
import unicodedata
from typing import Any, Literal, NotRequired, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field


class PipelineRequest(BaseModel):
    pipeline: Literal["partner_discovery", "market_intelligence"] = "partner_discovery"
    cliente: str = Field(min_length=1, max_length=300)
    objetivo: str = Field(min_length=1, max_length=2000)
    contexto: str | None = Field(default=None, max_length=4000)
    entidade_foco: str | None = Field(default=None, max_length=300)
    limite_consultas: int = Field(default=5, ge=1, le=10)
    limite_resultados_por_consulta: int = Field(default=2, ge=1, le=10)
    limite_urls: int = Field(default=5, ge=1, le=10)
    limite_candidatos: int = Field(default=5, ge=1, le=10)
    afirmacoes: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    projeto_id: str | None = None
    frente_id: str | None = None


class GraphState(TypedDict, total=False):
    request: dict[str, Any]
    plano: dict[str, Any]
    coleta: dict[str, Any]
    credibilidade: dict[str, Any]
    verificacao: NotRequired[dict[str, Any] | None]
    extracao: dict[str, Any]
    entidades: NotRequired[dict[str, Any] | None]
    rag: NotRequired[dict[str, Any] | None]
    analises: list[dict[str, Any]]
    recomendacao: NotRequired[dict[str, Any] | None]
    etapas: list[dict[str, Any]]
    warnings: list[str]
    status: str
    output: dict[str, Any]


class BackendClient:
    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or os.getenv("BACKEND_URL", "http://localhost:3000")).rstrip("/")
        self.token = token or os.getenv("CROSS_BACKEND_TOKEN", "")

    async def post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.token:
            raise RuntimeError("CROSS_BACKEND_TOKEN não configurado para o worker LangGraph.")
        headers = {"Authorization": f"Bearer {self.token}"}
        async with httpx.AsyncClient(base_url=self.base_url, timeout=180.0) as client:
            response = await client.post(path, json=payload, headers=headers)
        if response.status_code >= 400:
            detalhe = response.text[:500]
            raise RuntimeError(f"Backend respondeu {response.status_code} em {path}: {detalhe}")
        return response.json()


def _append_step(state: GraphState, nome: str, status: str, result: dict[str, Any] | None = None, observacao: str | None = None) -> list[dict[str, Any]]:
    steps = list(state.get("etapas", []))
    step: dict[str, Any] = {"nome": nome, "status": status}
    if result:
        if result.get("execucao_id"):
            step["execucao_id"] = result["execucao_id"]
        if result.get("origem"):
            step["origem"] = result["origem"]
    if observacao:
        step["observacao"] = observacao
    steps.append(step)
    return steps


def _common_links(request: dict[str, Any]) -> dict[str, Any]:
    return {key: request[key] for key in ("projeto_id", "frente_id") if request.get(key)}


def _limit_plan(plan: dict[str, Any], limit: int) -> dict[str, Any]:
    """Reduz o plano antes da coleta para respeitar o orçamento do projeto."""
    perguntas: list[dict[str, Any]] = []
    remaining = limit
    for pergunta in sorted(plan.get("perguntas", []), key=lambda item: item.get("prioridade", 5)):
        if remaining <= 0:
            break
        consultas = list(pergunta.get("consultas", []))[:remaining]
        if consultas:
            perguntas.append({**pergunta, "consultas": consultas})
            remaining -= len(consultas)
    return {**plan, "perguntas": perguntas}


def _normalizar_entidade(valor: str) -> str:
    sem_acentos = "".join(
        caractere for caractere in unicodedata.normalize("NFD", valor.lower())
        if unicodedata.category(caractere) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", " ", sem_acentos).strip()


def _perfil_tem_evidencia(state: GraphState, profile: dict[str, Any]) -> bool:
    """Impede que títulos de páginas virem candidatos antes da inferência."""
    entidade = _normalizar_entidade(str(profile.get("nome", "")))
    cliente = _normalizar_entidade(str(state["request"].get("cliente", "")))
    if len(entidade) < 3 or entidade == cliente or entidade.startswith(f"{cliente} "):
        return False
    if int(profile.get("confianca", 0)) < 55:
        return False
    urls_confiaveis = {
        item.get("url") for item in state.get("credibilidade", {}).get("avaliacoes", [])
        if int(item.get("score", 0)) >= 70
    }
    for coleta in state.get("coleta", {}).get("coletas", []):
        for resultado in coleta.get("resultados", []):
            texto = _normalizar_entidade(f"{resultado.get('titulo', '')} {resultado.get('trecho', '')}")
            if resultado.get("url") in urls_confiaveis and entidade in texto:
                return True
    return False


def make_graph(client: BackendClient | None = None):
    backend = client or BackendClient()

    async def search_planning(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        contexto = "\n".join(
            value for value in [
                f"Pipeline: {request['pipeline']}",
                request.get("contexto"),
                f"Entidade foco: {request['entidade_foco']}" if request.get("entidade_foco") else None,
                "A saída é rascunho e depende de validação humana.",
            ] if value
        )
        result = await backend.post("/v1/agentes/search-planning", {
            "objetivo": request["objetivo"],
            "contexto": contexto,
            **_common_links(request),
        })
        return {"plano": result["plano"], "etapas": _append_step(state, "search_planning", "sucesso", result)}

    async def source_collector(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        result = await backend.post("/v1/agentes/source-collector", {
            "plano": _limit_plan(state["plano"], request["limite_consultas"]),
            "limite_por_consulta": request["limite_resultados_por_consulta"],
            **_common_links(request),
        })
        coleta = result["coleta"]
        status = "sucesso" if coleta.get("total_resultados", 0) else "parcial"
        return {"coleta": coleta, "etapas": _append_step(state, "source_collector", status, result)}

    async def source_credibility(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        result = await backend.post("/v1/agentes/source-credibility", {
            "coleta": state["coleta"],
            **_common_links(request),
        })
        return {"credibilidade": result["credibilidade"], "etapas": _append_step(state, "source_credibility", "sucesso", result)}

    async def fact_verifier(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        if not request.get("afirmacoes"):
            return {
                "verificacao": None,
                "etapas": _append_step(state, "fact_verifier", "ignorada", observacao="Nenhuma afirmação foi fornecida."),
            }
        result = await backend.post("/v1/agentes/fact-verifier", {
            "afirmacoes": request["afirmacoes"],
            **_common_links(request),
        })
        return {"verificacao": result["verificacao"], "etapas": _append_step(state, "fact_verifier", "sucesso", result)}

    async def information_extractor(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        if not state["coleta"].get("total_resultados", 0):
            return {
                "extracao": {"total_conteudos": 0, "perfis": []},
                "etapas": _append_step(state, "information_extractor", "parcial", observacao="Nenhum resultado para extrair."),
            }
        result = await backend.post("/v1/agentes/information-extractor", {
            "coleta": state["coleta"],
            "limite_urls": request["limite_urls"],
            "foco": request["objetivo"],
            **_common_links(request),
        })
        extracao = result["extracao"]
        status = "sucesso" if extracao.get("perfis") else "parcial"
        return {"extracao": extracao, "etapas": _append_step(state, "information_extractor", status, result)}

    async def entity_resolver(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        nomes = list(dict.fromkeys(profile.get("nome", "") for profile in state.get("extracao", {}).get("perfis", []) if profile.get("nome")))
        if not nomes:
            return {
                "entidades": None,
                "etapas": _append_step(state, "entity_resolver", "ignorada", observacao="Nenhum perfil extraído."),
            }
        result = await backend.post("/v1/agentes/entity-resolver", {
            "entidades": nomes[: request["limite_candidatos"]],
            "tipo": "organizacao",
            **_common_links(request),
        })
        return {"entidades": result["entidades"], "etapas": _append_step(state, "entity_resolver", "sucesso", result)}

    async def rag_retrieval(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        consulta = " ".join(filter(None, [request["cliente"], request["objetivo"], request.get("entidade_foco")]))[:2000]
        result = await backend.post("/v1/agentes/rag/buscar", {"consulta": consulta, "limite": 5})
        status = "sucesso" if result.get("total", 0) else "parcial"
        return {
            "rag": result,
            "etapas": _append_step(state, "rag_retrieval", status, result, "Nenhum trecho relevante." if not result.get("total") else None),
        }

    async def crossability_reasoning(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        profiles = [
            profile for profile in state.get("extracao", {}).get("perfis", [])
            if _perfil_tem_evidencia(state, profile)
        ][: request["limite_candidatos"]]
        context_rag = [item["conteudo"] for item in (state.get("rag") or {}).get("trechos", [])]
        analyses: list[dict[str, Any]] = []
        for profile in profiles:
            result = await backend.post("/v1/agentes/crossability-reasoning", {
                "cliente": request["cliente"],
                "parceiro": profile["nome"],
                "objetivo": request["objetivo"],
                "perfil_parceiro": profile,
                "contexto_rag": context_rag,
                **_common_links(request),
            })
            analyses.append({
                "parceiro": profile["nome"],
                "execucao_id": result.get("execucao_id"),
                "origem": result.get("origem", "unknown"),
                "analise": result["analise"],
            })
        return {
            "analises": analyses,
            "etapas": _append_step(state, "crossability_reasoning", "sucesso" if analyses else "parcial", observacao=f"{len(analyses)} candidato(s) analisado(s)."),
        }

    async def recommendation(state: GraphState) -> dict[str, Any]:
        request = state["request"]
        if not state.get("analises"):
            return {
                "recomendacao": None,
                "etapas": _append_step(state, "recommendation", "ignorada", observacao="Nenhum candidato analisado."),
            }
        result = await backend.post("/v1/agentes/recommendation", {
            "candidatos": [{"parceiro": item["parceiro"], "analise": item["analise"]} for item in state["analises"]],
            **_common_links(request),
        })
        return {"recomendacao": result["recomendacao"], "etapas": _append_step(state, "recommendation", "sucesso", result)}

    async def finalize(state: GraphState) -> dict[str, Any]:
        analyses = state.get("analises", [])
        status = "sucesso" if analyses else "insufficient_evidence"
        warnings = list(state.get("warnings", []))
        oportunidades: list[dict[str, Any]] = []
        if analyses:
            try:
                persisted = await backend.post("/v1/agentes/oportunidades/persistir", {
                    "pipeline": state["request"]["pipeline"],
                    "cliente": state["request"]["cliente"],
                    "objetivo": state["request"]["objetivo"],
                    "analises": analyses,
                    "coleta": state.get("coleta"),
                    "credibilidade": state.get("credibilidade"),
                    "rag": state.get("rag"),
                    "extracao": state.get("extracao"),
                    **_common_links(state["request"]),
                })
                oportunidades = persisted.get("itens", [])
            except Exception as exc:
                warnings.append(f"Não foi possível persistir as oportunidades: {exc}")
        if not state.get("coleta", {}).get("total_resultados", 0):
            warnings.append("A coleta externa não retornou resultados.")
        if not state.get("rag", {}).get("total", 0):
            warnings.append("O RAG não retornou contexto relevante.")
        return {
            "status": status,
            "warnings": warnings,
            "output": {
                "orchestrator": "langgraph",
                "pipeline": state["request"]["pipeline"],
                "status": status,
                "etapas": state.get("etapas", []),
                "plano": state.get("plano"),
                "coleta": state.get("coleta"),
                "credibilidade": state.get("credibilidade"),
                "verificacao": state.get("verificacao"),
                "entidades": state.get("entidades"),
                "rag": state.get("rag"),
                "extracao": state.get("extracao"),
                "analises": analyses,
                "recomendacao": state.get("recomendacao"),
                "oportunidades": oportunidades,
                "warnings": warnings,
                "human_gate": "required",
            },
        }

    builder = StateGraph(GraphState)
    builder.add_node("search_planning", search_planning)
    builder.add_node("source_collector", source_collector)
    builder.add_node("source_credibility", source_credibility)
    builder.add_node("fact_verifier", fact_verifier)
    builder.add_node("information_extractor", information_extractor)
    builder.add_node("entity_resolver", entity_resolver)
    builder.add_node("rag_retrieval", rag_retrieval)
    builder.add_node("crossability_reasoning", crossability_reasoning)
    builder.add_node("recommendation", recommendation)
    builder.add_node("finalize", finalize)
    builder.add_edge(START, "search_planning")
    builder.add_edge("search_planning", "source_collector")
    builder.add_edge("source_collector", "source_credibility")
    builder.add_edge("source_credibility", "fact_verifier")
    builder.add_edge("fact_verifier", "information_extractor")
    builder.add_edge("information_extractor", "entity_resolver")
    builder.add_edge("entity_resolver", "rag_retrieval")
    builder.add_edge("rag_retrieval", "crossability_reasoning")
    builder.add_edge("crossability_reasoning", "recommendation")
    builder.add_edge("recommendation", "finalize")
    builder.add_edge("finalize", END)
    return builder.compile()


async def run_pipeline(request: PipelineRequest, client: BackendClient | None = None) -> dict[str, Any]:
    graph = make_graph(client)
    state = await graph.ainvoke({"request": request.model_dump(), "etapas": [], "analises": [], "warnings": []})
    return state["output"]
