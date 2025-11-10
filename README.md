# 🏋️‍♂️ Workout MVP — Thor Logger

**Thor Logger** is a local-first AI-powered workout tracker built with **TypeScript**, **Express**, and **SQLite**, designed to let you log workouts in natural language and get structured, chart-ready data — all running privately on your machine.

---

## 🚀 Features

✅ **Natural language workout logging**  
Type or dictate phrases like `floor press 4x12 @45` — the system parses and stores structured data.  

✅ **SQLite local storage**  
Your workouts are stored locally using `better-sqlite3`.  

✅ **Express API server**  
Simple REST endpoints for logging, querying, and analytics.  

✅ **Ollama / OpenAI integration**  
AI parses workout text into sets, reps, weights, and exercises.  

✅ **Web dashboard (Tailwind + Chart.js)**  
View progress and summaries in a clean, responsive UI.  

---

## 🧠 Tech Stack

| Component | Technology |
|------------|-------------|
| Backend | Node.js (TypeScript + Express) |
| Database | SQLite (via `better-sqlite3`) |
| AI Parsing | Local (Ollama) or Cloud (OpenAI API) |
| Frontend | HTML, Tailwind CSS, Chart.js |
| Validation | Zod |
| Dev Tools | TSX (for hot reload), TypeScript 5.x |

---

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create `.env`
```bash
OPENAI_API_KEY=sk-xxxxx   # or leave blank if using Ollama
MODEL=llama3:8b            # your default local model
PORT=3000
```

### 3. Run in dev mode
```bash
npm run dev
```

### 4. Build & run in prod
```bash
npm run build
npm start
```

---

## 🧩 Project Structure

```
workout-mvp/
├── src/
│   ├── server.ts           # Express entrypoint
│   ├── routes/             # API endpoints
│   ├── db/                 # SQLite schema + helpers
│   ├── ai/                 # Parsing logic (Ollama/OpenAI)
│   ├── utils/              # Helper functions
│   └── cron/               # Weekly summary jobs
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🗺️ Roadmap

### **Phase 1 — MVP (Complete ✅)**
- [x] Natural language input → structured workout parsing  
- [x] SQLite database for logs  
- [x] Simple web UI for typing/viewing workouts  
- [x] Express API for AI parsing  
- [x] Chart.js dashboard for progress visualization  

---

### **Phase 2 — AI Coach (In Progress 🧠)**  
> Adds intelligence, summaries, and progress reports.

- [x] Weekly progress summary table  
- [ ] Cron job (Sunday 6pm) to auto-generate weekly summaries  
- [ ] Compare week-over-week performance (% change in volume, best sets, etc.)  
- [ ] Store LLM summaries (via Ollama/OpenAI)  
- [ ] Generate visual “Weekly Report” card in the dashboard  

---

### **Phase 3 — Voice & Dictation (Planned 🎤)**  
> Hands-free logging and live parsing.

- [ ] Add speech-to-text (Web Speech API or Whisper.cpp)  
- [ ] Support real-time dictation input  
- [ ] “Start workout” and “log next set” voice commands  

---

### **Phase 4 — Smart Insights & Recommendations (Planned 📈)**  
> Turn your logs into actionable coaching advice.

- [ ] Trend detection (plateaus, progressive overload)  
- [ ] AI suggestions for next week’s load targets  
- [ ] Highlight missed muscle groups / imbalance detection  
- [ ] Periodization planner  

---

### **Phase 5 — Multi-Device Sync + Privacy Layer (Future 🔒)**  
> Local-first architecture with optional sync.

- [ ] Local MCP (Model Context Protocol) endpoint for AI agents  
- [ ] Optional encrypted cloud sync (user’s choice)  
- [ ] Data export/import (CSV, JSON)  
- [ ] Full offline support  

---

## 🧪 Example API Usage

```bash
POST /api/log
{
  "input": "dumbbell floor press 4x12 @45"
}
```

Response:
```json
{
  "exercise": "Dumbbell Floor Press",
  "sets": 4,
  "reps": 12,
  "weight": 45,
  "volume": 2160
}
```

---

## 🧭 Vision

> “AI that remembers your workouts like a coach — not a cloud.”  
Thor Logger aims to be a fully local, privacy-first AI workout companion that learns your progress over time and adapts your plan intelligently — no accounts, no uploads, just your data and your strength.
