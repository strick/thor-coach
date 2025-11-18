# 🏋️‍♂️ Thor Stack — AI-Native Workout Logging System

**Thor Stack** is a local-first, AI-powered workout tracking monorepo built with **TypeScript**, **Express**, **SQLite**, and **MCP (Model Context Protocol)**. Log workouts in natural language, get AI-powered insights, and integrate with AI agents — all running privately on your machine.

---

## 🚀 Features

✅ **Natural language workout logging**
Type or dictate phrases like `floor press 4x12 @45` — AI parses and stores structured data.

✅ **SQLite local storage**
Your workouts are stored locally using `better-sqlite3`.

✅ **MCP Server integration**
Expose workout tools to AI agents via Model Context Protocol.

✅ **Monorepo architecture**
Clean separation: API, Web, MCP Server, and shared packages.

✅ **Express REST API**
Comprehensive endpoints for logging, querying, analytics, and weekly summaries.

✅ **Ollama / OpenAI integration**
AI parses workout text into sets, reps, weights, and exercises.

✅ **Web dashboard (Tailwind + Chart.js)**
View progress, edit workouts, track exercises, and review weekly AI-generated summaries.

✅ **Conversational AI Agent**
Chat endpoint with LLM tool calling, session management, and MCP backend integration.

✅ **Raspberry Pi Voice Client**
Voice-enabled frontend with speech-to-text, text-to-speech, and agent integration.

---

## 🧠 Tech Stack

| Component | Technology |
|------------|-------------|
| Backend API | Node.js (TypeScript + Express) |
| Database | SQLite (via `better-sqlite3`) |
| AI Parsing | Local (Ollama) or Cloud (OpenAI API) |
| Frontend | HTML, Tailwind CSS, Chart.js |
| MCP Server | Model Context Protocol SDK |
| Shared Types | Zod validation schemas |
| Monorepo | npm workspaces |
| Dev Tools | TSX (hot reload), TypeScript 5.x |

---

## 📁 Monorepo Structure

```
thor-stack/
├── apps/
│   ├── thor-api/          # REST API + Database
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── controllers/
│   │   │   └── middleware/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── thor-web/          # Web Frontend
│   │   ├── public/
│   │   ├── server.js
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── package.json
│   │
│   ├── thor-agent/        # Conversational Agent
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── package.json
│   │
│   ├── thor-mcp/          # MCP Server
│   │   ├── src/
│   │   ├── dist/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── package.json
│   │
│   └── thor-meta-runner/  # Agentic Health Coordinator
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes/
│       │   ├── services/
│       │   │   ├── router.ts        # LLM-based domain classification
│       │   │   ├── parsers.ts       # Domain-specific parsing
│       │   │   └── metaRunner.ts    # Orchestration
│       │   ├── clients/
│       │   ├── utils/
│       │   └── config.ts
│       ├── Dockerfile
│       ├── README.md
│       └── package.json
│
├── pi/                    # Raspberry Pi Voice Client (Python)
│   ├── main.py
│   ├── stt.py
│   ├── tts.py
│   ├── client.py
│   ├── test-flow.py
│   ├── .env.example
│   ├── requirements.txt
│   ├── README.md
│   └── QUICKSTART.md
│
├── packages/
│   └── shared/            # Shared Types & Schemas
│       ├── src/
│       │   ├── types.ts
│       │   ├── schemas.ts
│       │   └── constants.ts
│       └── package.json
│
├── package.json           # Root workspace
└── CLAUDE.md             # Development guide
```

---

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create `.env` in `apps/thor-api/`
```bash
OPENAI_API_KEY='sk-xxxxx'   # or leave blank if using Ollama
USE_OLLAMA=true              # Set to true for local LLM
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
PORT=3000
```

### 3. Run in development mode

**Start API:**
```bash
npm run dev:api
```

**Start Web (in another terminal):**
```bash
npm run dev:web
```

**Start MCP Server (optional):**
```bash
npm run dev:mcp
```

### 4. Build all packages
```bash
npm run build
```

### 5. Production mode
```bash
# API
npm run build:api && npm run start --workspace=thor-api

# Web
npm run start --workspace=thor-web
```

---

## 🔌 MCP Server Setup

The Thor MCP Server exposes workout tools to AI agents via Model Context Protocol.

**Configure in Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "thor": {
      "command": "node",
      "args": ["/absolute/path/to/thor-stack/apps/thor-mcp/dist/index.js"],
      "env": {
        "THOR_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Available Tools:**
- `log_workout` - Log workouts using natural language
- `get_today_exercises` - Get today's planned exercises
- `get_exercises_for_day` - Get exercises for specific day
- `get_progress_summary` - Get workout progress for date range
- `get_weekly_summaries` - Get AI-generated weekly summaries
- `get_workouts_by_date` - Get workouts for specific date
- `get_all_exercises` - List all exercises in plan
- `get_exercise_history` - Get historical data for exercise

See `apps/thor-mcp/README.md` for detailed documentation.

---

## 🧩 Workspace Commands

```bash
# Development
npm run dev:api      # Start API server (hot reload)
npm run dev:web      # Start web server
npm run dev:mcp      # Start MCP server (watch mode)

# Building
npm run build        # Build all workspaces
npm run build:api    # Build API only
npm run build:mcp    # Build MCP server only

# Testing
npm run test         # Run tests in all workspaces
npm run test:api     # Run API tests only

# Cleanup
npm run clean        # Remove all dist/ and node_modules/
```

---

## 🧪 Example API Usage

### Log a workout
```bash
POST http://localhost:3000/api/ingest
Content-Type: application/json

{
  "text": "floor press 4x12 @45, dumbbell row 3x8 @35"
}
```

### Get progress summary
```bash
GET http://localhost:3000/api/progress/summary?from=2025-01-01&to=2025-01-31
```

### Get weekly summaries
```bash
GET http://localhost:3000/api/weekly-summaries?limit=10
```

---

## 🗺️ Roadmap

### **Phase 1 — MVP (Complete ✅)**
- [x] Natural language input → structured workout parsing
- [x] SQLite database for logs
- [x] Simple web UI for typing/viewing workouts
- [x] Express API for AI parsing
- [x] Chart.js dashboard for progress visualization

### **Phase 2 — AI Coach (Complete ✅)**
- [x] Weekly progress summary table
- [x] Cron job (Sunday 6pm) to auto-generate weekly summaries
- [x] Compare week-over-week performance
- [x] Store LLM summaries (via Ollama/OpenAI)
- [x] Generate visual "Weekly Report" card in dashboard
- [x] Enable editing of workouts
- [x] Track individual exercises
- [x] Inline editing of each workout

### **Phase 2.5 — UX Polish (Complete ✅)**
- [x] Confirmation dialogs for destructive actions
- [x] Empty states with helpful guidance
- [x] Loading skeletons for data fetching
- [x] Better error handling
- [x] "Today's Workout" quick view
- [x] Progressive overload helper
- [x] Better date navigation
- [x] Keyboard shortcuts
- [x] Data export (CSV/JSON)
- [x] Multi-select for batch delete
- [x] Settings for switching models

### **Phase 3 — Monorepo & MCP (Complete ✅)**
- [x] Restructure as monorepo (thor-stack)
- [x] Create shared package for types/schemas
- [x] Implement MCP server with 8 tools
- [x] Build with npm workspaces
- [x] Separate API, Web, and MCP concerns

### **Phase 3.5 — Agentic Health Layer / Meta-Runner (In Progress 🚀)**
- [x] New `thor-meta-runner` service with LLM-based query routing
- [x] Multi-domain support: WORKOUT | NUTRITION | HEALTH_LOG | OVERVIEW
- [x] Unified `/chat` endpoint for natural language health queries
- [x] Router service with fallback heuristic classification
- [x] Domain-specific parsers (workout, meal, health event)
- [ ] Database schema extensions (meals, health_events tables)
- [ ] MCP tool extensions (log_meal, log_health_event, get_health_summary)
- [ ] Web UI integration for meta-runner queries
- [ ] Documentation updates

### **Phase 4 — Voice & Dictation (Planned 🎤)**
- [ ] Add speech-to-text (Web Speech API or Whisper.cpp)
- [ ] Support real-time dictation input
- [ ] Voice-controlled agent API with /chat endpoint
- [ ] "Start workout" and "log next set" voice commands

### **Phase 5 — Smart Insights & Recommendations (Planned 📈)**
- [ ] Trend detection (plateaus, progressive overload)
- [ ] AI suggestions for next week's load targets
- [ ] Highlight missed muscle groups / imbalance detection
- [ ] Periodization planner

### **Phase 6 — Multi-Device Sync (Future 🔒)**
- [ ] Optional encrypted cloud sync
- [ ] Full offline support
- [ ] Data backup and restore

---

## 🧭 Vision

> "AI that remembers your workouts like a coach — not a cloud."

Thor Stack is a fully local, privacy-first AI workout companion that integrates with AI agents via MCP, learns your progress over time, and adapts intelligently — no accounts, no uploads, just your data and your strength.

---

## 📚 Documentation

- **ARCHITECTURE.md** - Complete request flow diagrams and LLM interaction details
- **CLAUDE.md** - Development guide for working with this codebase
- **apps/thor-api/README.md** - REST API endpoints and services
- **apps/thor-meta-runner/README.md** - Meta-runner agentic health coordinator
- **apps/thor-mcp/README.md** - MCP Server documentation
- **apps/thor-agent/README.md** - Conversational Agent documentation
- **pi/README.md** - Raspberry Pi Voice Client deployment guide
- **apps/thor-mcp/TESTING.md** - MCP Server testing guide
- **MONOREPO_MIGRATION_PLAN.md** - Migration history and decisions

---

## 🤝 Contributing

This is a personal project, but contributions are welcome! Feel free to:
- Report issues
- Suggest features
- Submit pull requests
- Share how you're using Thor Stack

---

## 📄 License

MIT
