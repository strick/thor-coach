# Thor Web - Workout Tracking Dashboard

Static web frontend for the Thor workout tracking system. Provides a visual interface for viewing workouts, tracking progress, and managing workout plans.

---

## Features

- **📊 Progress Dashboard** - View workout history and progress charts
- **📅 Calendar View** - See workouts by date
- **💪 Exercise Tracking** - Track individual exercise progress over time
- **📈 Weekly Summaries** - AI-generated weekly workout summaries with insights
- **🎤 Voice Input** - Speech-to-text for hands-free workout logging (Web Speech API)
- **📱 Mobile Responsive** - Works on phones, tablets, and desktops
- **⚙️ Settings** - Configure API URL for multi-device access
- **🔧 System Status** - Live connection status for API and LLM services

---

## Architecture

Thor Web is a **static single-page application** (SPA) built with vanilla JavaScript, HTML, and CSS. It communicates with thor-api via REST endpoints.

```
┌─────────────────────────────────────┐
│         Thor Web (Port 3001)        │
│  ┌──────────────────────────────┐   │
│  │  Static HTML/CSS/JS          │   │
│  │  - index.html                │   │
│  │  - styles (Tailwind CSS)     │   │
│  │  - Chart.js for graphs       │   │
│  └──────────┬───────────────────┘   │
└─────────────┼───────────────────────┘
              │ HTTP REST API
              ▼
┌─────────────────────────────────────┐
│       Thor API (Port 3000)          │
│  - Workout logging                  │
│  - Exercise data                    │
│  - Progress analytics               │
│  - Weekly summaries                 │
└─────────────────────────────────────┘
```

---

## Setup

### Development Mode

```bash
# From monorepo root
npm run dev:web
```

Web server runs at: `http://localhost:3001`

### Production Mode

```bash
# Build (not required for static files)
npm run build:web

# Start
npm run start --workspace=thor-web
```

### Docker

```bash
# Build and run via Docker Compose
docker compose up thor-web
```

---

## File Structure

```
apps/thor-web/
├── public/
│   ├── index.html          # Main SPA entry point
│   ├── styles/
│   │   └── (inline in HTML) # Tailwind CSS
│   └── scripts/
│       └── (inline in HTML) # Vanilla JavaScript
├── server.js               # Express static file server
├── package.json
└── README.md
```

---

## Key Components

### 1. Workout Input
- **Text Input**: Type workout descriptions in natural language
- **Voice Input**: Click microphone button and speak workouts
- **Format**: "floor press 3x12 @45, dumbbell row 4x10 @35"

### 2. Progress Charts
- Last 30 days workout frequency
- Total volume lifted over time
- Powered by Chart.js

### 3. Weekly Reports
- AI-generated summaries of training week
- Total sessions, volume, and week-over-week changes
- Top exercises by volume
- Historical summary viewer

### 4. Single Exercise Tracking
- Select any exercise from your plan
- View complete history (dates, sets, reps, weights)
- Calculate total volume per session
- Stats: total sessions, sets, max weight, average weight

### 5. Workout Management
- View workouts by date
- Delete individual sessions
- See which LLM parsed each workout (Ollama or OpenAI)

### 6. Settings
- **API URL Configuration**: Change API endpoint for network access
- **System Status**: Real-time connection indicators
- **LLM Info**: Shows which AI model is being used

---

## Configuration

### API URL Setting

By default, the web app connects to `http://localhost:3000`. To access from other devices:

1. Open `http://your-server-ip:3001`
2. Click ⚙️ Settings
3. Set API URL to `http://your-server-ip:3000`
4. Click Save

Settings are saved in browser localStorage per device.

---

## API Endpoints Used

The web app calls these thor-api endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Check API connectivity |
| `GET /config` | Get server configuration (LLM info) |
| `POST /api/ingest` | Log workouts via natural language |
| `GET /api/day/:dow` | Get exercises for a specific day |
| `GET /api/progress/summary` | Get workout analytics |
| `GET /api/weekly-summaries` | Get AI-generated weekly summaries |
| `POST /api/weekly-summaries/generate` | Manually trigger summary generation |
| `GET /api/workouts?date=YYYY-MM-DD` | Get workouts for a date |
| `DELETE /api/workouts/:id` | Delete a workout session |
| `GET /api/exercises` | List all exercises |
| `GET /api/exercises/:id/history` | Get exercise history |

---

## Technologies

- **HTML5** - Structure and Web Speech API
- **Tailwind CSS** - Styling via CDN
- **Vanilla JavaScript** - No framework dependencies
- **Chart.js** - Data visualization
- **Express** - Static file server
- **Web Speech API** - Voice input support (Chrome/Edge)

---

## Browser Support

- ✅ Chrome/Edge (full support including voice input)
- ✅ Firefox (no voice input)
- ✅ Safari (no voice input)
- ✅ Mobile browsers (responsive design)

**Note**: Voice input requires Chrome/Edge due to Web Speech API support.

---

## Development

### Adding New Features

The SPA is a single HTML file with inline JavaScript. To add features:

1. Edit `public/index.html`
2. Add HTML markup in the appropriate section
3. Add JavaScript functions inline
4. Refresh browser (no build step needed)

### Styling

Tailwind CSS is loaded via CDN. Use Tailwind utility classes directly in HTML.

### API Integration

All API calls use `fetch()` with the configured `API_URL`:

```javascript
const response = await fetch(`${API_URL}/api/endpoint`);
const data = await response.json();
```

---

## Deployment

### Single Machine (Development)

```bash
npm run dev:web
# Access at http://localhost:3001
```

### Network Access (LAN)

1. **Start web server**:
   ```bash
   npm run start --workspace=thor-web
   ```

2. **Configure firewall** (Windows):
   ```powershell
   New-NetFirewallRule -DisplayName "Thor Web" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
   ```

3. **Access from other devices**:
   ```
   http://192.168.1.X:3001
   ```
   (Replace X with your server's IP)

4. **Configure API URL on remote device**:
   - Open Settings in web app
   - Set API URL to `http://192.168.1.X:3000`
   - Save

### Docker Deployment

```bash
docker compose up -d thor-web
```

Web app available at `http://host-ip:3001`

---

## Troubleshooting

### Web app can't reach API

**Problem**: Orange status indicators, "Server: ?" shown

**Solution**:
1. Verify thor-api is running: `curl http://localhost:3000/api/health`
2. Check API URL in Settings matches your server's IP
3. Verify firewall allows port 3000

### Voice input not working

**Problem**: Microphone button doesn't record

**Solution**:
- Use Chrome or Edge browser (Firefox/Safari don't support Web Speech API)
- Grant microphone permissions when prompted
- Check microphone is connected and working

### Charts not loading

**Problem**: Progress charts show "Loading..." forever

**Solution**:
- Check browser console for errors
- Verify Chart.js loaded from CDN (check network tab)
- Ensure API is returning data

### Settings not persisting

**Problem**: Settings reset after refresh

**Solution**:
- Check browser localStorage is enabled
- Try clearing site data and re-configuring
- Verify not using incognito/private browsing mode

---

## Future Enhancements

- **Progressive Web App (PWA)**: Offline support and app installation
- **Real-time Updates**: WebSocket connection for live workout updates
- **Dark Mode**: Toggle between light and dark themes
- **Export Data**: Download workout history as CSV/JSON
- **Exercise Library**: Browse and search exercise database with instructions
- **Custom Plans**: Create and manage custom workout plans via UI
- **Social Features**: Share progress with training partners

---

## Related Documentation

- **Main README**: See `/README.md` for full system overview
- **API Documentation**: See `/apps/thor-api/README.md`
- **Development Guide**: See `/CLAUDE.md` for codebase details
- **Architecture**: See `/ARCHITECTURE.md` for system design

---

## License

MIT (same as Thor Stack)
