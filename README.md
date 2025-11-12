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

### **Phase 2 — AI Coach (Complete ✅)**
> Adds intelligence, summaries, and progress reports.

- [x] Weekly progress summary table
- [x] Cron job (Sunday 6pm) to auto-generate weekly summaries
- [x] Compare week-over-week performance (% change in volume, best sets, etc.)
- [x] Store LLM summaries (via Ollama/OpenAI)
- [x] Generate visual "Weekly Report" card in the dashboard
- [x] Enable editing of single days
- [x] Enable user to track single exercises at a time
- [x] Users should be able to inline edit each workout
- [x] Users should be able to tell what is going on when a button is clicked

---

### **Phase 2.5 — UX Polish (Complete ✅)**
> Refine the user experience with better feedback, safety, and convenience features.

**Safety & Core UX:**
- [x] Confirmation dialogs for destructive actions (delete workouts)
- [x] Empty states with helpful guidance for new users
- [x] Loading skeletons for data fetching (not just buttons)
- [x] Better error handling and retry suggestions

**Convenience & Engagement:**
- [x] "Today's Workout" quick view (planned exercises + last session data)
- [x] Progressive overload helper (show last session's weights/reps during logging)
- [x] Better date navigation (Today/Yesterday buttons, arrow key navigation)
- [x] Keyboard shortcuts (Ctrl+Enter to submit, Esc to cancel, arrows for dates)
- [x] Data export (CSV/JSON download)
- [x] Todays indiviual workouts should show at the bottom of the Today tab and be persistent so that users can modify their current workout if needed.
- [x] Settings should allow the user to switch the model being used.  They should be aple to toggle between OpenAI or Ollama. OpenAI will require a key (if not set already) and Ollama would require to choose between models available.
- [x] When a user changes teh day, the Today's Plan list should automatically update.
- [x] Today's workouts should show in a single pane
- [x] Enable multi select for deleting today's workouts
- [x] Show single pane Review and Edit workouts when the workouts are loaded for better UX.  This would be hte same as Today's works single pane view.
- [x] Enable mult select for deleting workouts in the history.

**Future Enhancements (Deferred):**
- [ ] Personal Records (PRs) tracking with highlights
- [x] Form validation with real-time feedback
- [ ] Workout templates and "repeat last workout" functionality
- [ ] Data import (CSV/JSON upload)
- [ ] Exercise autocomplete with recent suggestions
- [x] Optimistic UI updates (instant feedback, rollback on error)
- [x] Create a calendar pane as the first item in workout history that shows days you hit and missed.

---

### **Phase 3 — Voice & Dictation (Planned 🎤)**
> Hands-free logging and live parsing.

- [ ] Add speech-to-text (Web Speech API or Whisper.cpp)
- [ ] Support real-time dictation input
- [ ] "Start workout" and "log next set" voice commands

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
