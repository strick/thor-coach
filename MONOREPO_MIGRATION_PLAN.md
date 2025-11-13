# Thor-Stack Monorepo Migration Plan

**Status:** 🟡 IN PROGRESS
**Approach:** Incremental with testing checkpoints
**Started:** 2025-11-12

---

## 🎯 Architecture Decisions (APPROVED)

1. **Package Manager:** npm workspaces (native, simple)
2. **Migration Strategy:** Move existing files, preserve history
3. **Test Location:** Move to `apps/thor-api/src/__tests__/`
4. **Shared Code:** `packages/shared/` for types/schemas/constants
5. **Database:** Move to `apps/thor-api/workout.db` (configurable)
6. **Dev Workflow:** Root-level workspace scripts
7. **MCP Implementation:** `@modelcontextprotocol/sdk` (TypeScript)
8. **Agent Architecture:** Custom lightweight implementation

---

## 📋 Migration Phases

### ✅ Phase 0: Preparation
- [x] Kill running dev servers
- [x] Create migration plan document
- [ ] Create backup branch
- [ ] Document current state

### 🔄 Phase 1: Monorepo Structure Setup
**Goal:** Create folder structure and workspace configuration

**Steps:**
1. Create new directory structure
2. Set up root package.json with workspaces
3. Create workspace package.json files
4. Install workspace dependencies

**Testing Checkpoint:** Verify workspace setup with `npm ls --workspaces`

---

### 🔄 Phase 2: Move Thor API
**Goal:** Move backend API into `apps/thor-api/`

**Steps:**
1. Create `apps/thor-api/` structure
2. Move `src/` → `apps/thor-api/src/`
3. Move `src/__tests__/` → `apps/thor-api/src/__tests__/`
4. Move `workout.db` → `apps/thor-api/workout.db`
5. Create `apps/thor-api/package.json`
6. Move relevant dependencies
7. Update import paths
8. Update tsconfig.json
9. Create build scripts

**Testing Checkpoint:**
- `cd apps/thor-api && npm run build`
- `cd apps/thor-api && npm test`
- `cd apps/thor-api && npm run dev`
- Verify API responds at http://localhost:3000/api/health

---

### 🔄 Phase 3: Move Thor Web App
**Goal:** Move frontend into `apps/thor-web/`

**Steps:**
1. Create `apps/thor-web/` structure
2. Move `public/` → `apps/thor-web/public/`
3. Create `apps/thor-web/package.json`
4. Set up simple HTTP server (express static)
5. Update API URL configuration
6. Create dev script

**Testing Checkpoint:** ⚠️ **USER VERIFICATION REQUIRED**
- Start API: `npm run dev:api`
- Start Web: `npm run dev:web`
- Open http://localhost:3001
- Verify all functionality works

---

### 🔄 Phase 4: Create Shared Package
**Goal:** Extract common types/schemas/constants

**Steps:**
1. Create `packages/shared/` structure
2. Extract types from API
3. Extract Zod schemas
4. Extract constants (THOR_PLAN_ID, etc.)
5. Update imports in API and Web
6. Build shared package

**Testing Checkpoint:**
- Verify API still works
- Verify Web still works
- Run all tests

---

### 🔄 Phase 5: Implement Thor MCP Server
**Goal:** Create MCP server exposing workout tools

**Steps:**
1. Scaffold `mcp/thor-mcp/`
2. Install `@modelcontextprotocol/sdk`
3. Implement MCP server setup
4. Implement tools:
   - `logWorkoutFromText`
   - `getLastSession`
   - `getWeeklySummary`
5. Add tool schemas
6. Create tests
7. Test with MCP Inspector

**Testing Checkpoint:**
- Test each MCP tool individually
- Verify tool schemas
- Test with Claude Desktop MCP config

---

### 🔄 Phase 6: Implement Thor Agent Runner
**Goal:** Create voice agent API with /chat endpoint

**Steps:**
1. Scaffold `apps/thor-voice-agent/`
2. Implement `/chat` endpoint
3. Integrate Ollama/OpenAI
4. Connect to Thor MCP server
5. Implement conversation state
6. Add reasoning loop
7. Create tests

**Testing Checkpoint:**
- Test /chat with curl
- Verify MCP tool calls work
- Test conversation state
- Test with voice input simulation

---

### 🔄 Phase 7: Documentation & Polish
**Goal:** Update all documentation and scripts

**Steps:**
1. Update README.md
2. Update CLAUDE.md
3. Add architecture diagram
4. Document MCP tools
5. Document agent API
6. Create development guide
7. Update all npm scripts

**Testing Checkpoint:**
- Full system integration test
- Run all test suites
- Verify all documentation

---

## 🗂️ Final Directory Structure

```
thor-stack/
├── apps/
│   ├── thor-api/           # REST API + DB
│   │   ├── src/
│   │   │   ├── __tests__/  # All API tests
│   │   │   ├── controllers/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── db.ts
│   │   │   ├── seed.ts
│   │   │   ├── config.ts
│   │   │   └── server.ts
│   │   ├── dist/           # Compiled JS
│   │   ├── workout.db      # SQLite database
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── thor-web/           # Web frontend
│   │   ├── public/
│   │   │   ├── js/
│   │   │   ├── index.html
│   │   │   └── tests.html
│   │   ├── src/
│   │   │   └── server.ts   # Static file server
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── thor-voice-agent/   # Voice agent API
│       ├── src/
│       │   ├── __tests__/
│       │   ├── chat/       # Chat endpoint logic
│       │   ├── mcp-client/ # MCP client wrapper
│       │   ├── llm/        # LLM integration
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
│
├── mcp/
│   └── thor-mcp/           # Thor MCP server
│       ├── src/
│       │   ├── __tests__/
│       │   ├── tools/      # MCP tool implementations
│       │   ├── schemas/    # Tool schemas
│       │   └── index.ts    # MCP server entrypoint
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/             # Shared types/schemas
│       ├── src/
│       │   ├── types/
│       │   ├── schemas/
│       │   └── constants/
│       ├── package.json
│       └── tsconfig.json
│
├── .env                    # Environment variables
├── .nvmrc                  # Node version
├── package.json            # Root workspace config
├── tsconfig.base.json      # Shared TS config
├── README.md               # Main documentation
├── CLAUDE.md               # Development guide
├── FEATURE_ENHANCEMENT_PLAN.md
├── SPRINT1_SUMMARY.md
└── MONOREPO_MIGRATION_PLAN.md (this file)
```

---

## 🎯 Success Criteria

### Phase 1-2 Complete:
- ✅ API runs at http://localhost:3000
- ✅ All existing tests pass
- ✅ Database operations work

### Phase 3 Complete (USER CHECKPOINT):
- ✅ Web app runs at http://localhost:3001
- ✅ Can log workouts
- ✅ Can view history
- ✅ Can see weekly summaries
- ✅ All UI features functional

### Phase 4 Complete:
- ✅ Shared package builds successfully
- ✅ No duplicate type definitions
- ✅ All imports resolve correctly

### Phase 5 Complete:
- ✅ MCP server starts without errors
- ✅ All tools respond correctly
- ✅ Tool schemas validate
- ✅ Can test with MCP Inspector

### Phase 6 Complete:
- ✅ /chat endpoint responds
- ✅ Agent can call MCP tools
- ✅ Natural language responses work
- ✅ Conversation state maintained

### Phase 7 Complete:
- ✅ All documentation updated
- ✅ All tests passing
- ✅ README has setup instructions
- ✅ Development workflow documented

---

## 🚨 Rollback Plan

If any phase fails:
1. Git reset to previous checkpoint
2. Review errors
3. Fix issues
4. Re-attempt phase

**Current Branch:** `main`
**Backup Branch:** `pre-monorepo-backup` (will create)

---

## 📝 Notes

- All existing features must continue working
- No functionality should be lost
- Tests must pass at each checkpoint
- User verification required after Phase 3
- Can pause at any phase if issues arise

---

**Ready to begin Phase 0: Preparation**
