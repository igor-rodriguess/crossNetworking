# Orquestrador LangGraph da Cross

O worker usa LangGraph para coordenar os agentes já expostos pelo backend TypeScript. O Ollama permanece local e é usado pelos agentes de IA por meio de `AI_PROVIDER=ollama`.

## Preparação

```powershell
py -3.13 -m venv orchestrator\.venv
orchestrator\.venv\Scripts\python.exe -m pip install -r orchestrator\requirements.txt
```

Ollama:

```powershell
ollama pull qwen3:4b
```

O worker precisa de um access token de usuário com persona `estrategista`, `coordenador` ou `administrador`:

```powershell
$env:BACKEND_URL="http://localhost:3000"
$env:CROSS_BACKEND_TOKEN="<access-token>"
```

## Execução

Com o backend rodando:

```powershell
orchestrator\.venv\Scripts\python.exe -m orchestrator.main `
  --pipeline partner_discovery `
  --cliente "Cross Networking" `
  --objetivo "Encontrar marcas com potencial de parceria em música e entretenimento"
```

O resultado permanece como rascunho e inclui `human_gate: required`. O worker não aprova nem grava uma oportunidade no domínio automaticamente.

## Grafo

`Search Planning → Source Collector → Source Credibility → Fact Verifier → Information Extractor → Entity Resolver → RAG Retrieval → Crossability Reasoning → Recommendation → Finalize`

LangGraph mantém o estado do projeto, permite ramificações para ausência de evidência e deixa o Human Gate fora da execução automática. A auditoria das etapas continua sendo registrada pelo backend.
