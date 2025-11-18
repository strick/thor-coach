# Thor Meta-Runner

**Agentic health coordinator** for the Thor Stack.

Accepts natural language from web UI or voice clients, routes the query across multiple health domains (workouts, nutrition, health logs, overview), and returns structured responses with actionable summaries.

## Features

- **Multi-domain routing**: Classifies user input (WORKOUT, NUTRITION, HEALTH_LOG, OVERVIEW)
- **LLM-powered parsing**: Uses local Ollama or OpenAI to extract structured data from natural language
- **Unified API**: Single `/chat` endpoint for all health queries
- **Extensible architecture**: Modular parsers and executors for each domain

## Quick Start

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Environment Variables

```bash
PORT=3001
THOR_API_URL=http://localhost:3000
USE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OPENAI_API_KEY=sk-... # if using OpenAI instead
```

## API

### POST /chat

Request:
```json
{
  "text": "logged 3x8 bench press at 225",
  "mode": "auto",
  "periodDays": 14
}
```

Response:
```json
{
  "agent": "thor",
  "intent": "log_workout",
  "actions": ["parsed 1 exercise", "logged session"],
  "message": "Got it! Logged bench press 3x8 @ 225 lbs.",
  "rawToolResults": {...}
}
```

## Architecture

```
voice/text input
    ↓
router (LLM classification)
    ↓
parsers (domain-specific)
    ↓
executor (API calls to thor-api)
    ↓
response (natural language + metadata)
```

## Development

See [CLAUDE.md](../../CLAUDE.md) for extending the meta-runner with new domains.
