from __future__ import annotations

import argparse
import asyncio
import json
import sys

from .graph import PipelineRequest, run_pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Executa o orquestrador LangGraph da Plataforma Cross.")
    parser.add_argument("--input", help="JSON com a entrada do pipeline.")
    parser.add_argument("--pipeline", choices=["partner_discovery", "market_intelligence"], default="partner_discovery")
    parser.add_argument("--cliente", default="Cross Networking")
    parser.add_argument("--objetivo", default="Encontrar oportunidades de parceria em música e entretenimento")
    parser.add_argument("--contexto")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    if args.input:
        payload = json.loads(args.input)
    else:
        payload = {
            "pipeline": args.pipeline,
            "cliente": args.cliente,
            "objetivo": args.objetivo,
            "contexto": args.contexto,
            "limite_consultas": 2,
            "limite_resultados_por_consulta": 1,
            "limite_urls": 2,
            "limite_candidatos": 2,
        }
    result = await run_pipeline(PipelineRequest.model_validate(payload))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(130)
