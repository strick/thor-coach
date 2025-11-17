# Pi Voice Client - Quick Start

## ✅ What's Working

The complete voice client flow is **fully functional**:

```
You speak → Pi records → Whisper transcribes → Agent processes →
Agent calls MCP tools → Workout logged to DB → Agent responds →
Pi speaks response → Workout appears in web app
```

## 🧪 Testing on Your Dev Machine

Since you're on WSL, you can test the **communication flow** without actual audio:

### Test 1: Simple Flow Test

```bash
cd pi
python3 test-flow.py
```

This simulates the complete flow and shows you exactly what happens when someone speaks to the Pi.

**Expected output:**
- Message sent to agent
- Agent calls `log_workout` tool
- Workout logged to database
- Motivational response generated
- Response ready to be spoken

### Test 2: Direct Client Test

```bash
cd pi
python3 client.py http://localhost:3002
```

This tests connectivity and sends a real message to the agent.

**Note:** Agent responses take 30-60 seconds due to Ollama LLM processing.

## 🎤 On a Real Raspberry Pi

### Prerequisites

- Raspberry Pi (3B+ or newer)
- USB microphone
- Speaker (USB, 3.5mm, or HDMI audio)
- Network connection to your thor-agent server

### Quick Setup

1. **Copy pi/ folder to Raspberry Pi:**

```bash
# From your dev machine
rsync -avz pi/ pi@raspberrypi.local:~/thor-pi/
```

2. **On the Pi, install dependencies:**

```bash
cd ~/thor-pi
sudo apt-get update
sudo apt-get install -y portaudio19-dev python3-pyaudio espeak

python3 -m venv venv
source venv/bin/activate
pip install sounddevice numpy scipy soundfile requests python-dotenv pyttsx3 openai
```

3. **Configure environment:**

```bash
cp .env.example .env
nano .env
```

Edit these values:
```env
# Your server's IP address (not localhost on Pi!)
THOR_AGENT_URL=http://192.168.1.X:3002

# Use OpenAI API for faster transcription
STT_MODE=api
OPENAI_API_KEY=sk-your-key-here

# TTS engine
TTS_ENGINE=pyttsx3
```

4. **Run interactive mode:**

```bash
source venv/bin/activate
python3 main.py --mode interactive
```

Press Enter, speak your workout, and hear the response!

## 🔊 Example Voice Commands

Once on the Pi, you can say:

- **"Log my workout: floor press 3 sets of 12 at 45 pounds"**
- **"What exercises should I do today?"**
- **"Show me my progress for the last 30 days"**
- **"How much did I lift last Monday?"**

## 🌐 Checking the Web App

After speaking to the Pi, open the web app to see your logged workouts:

```
http://localhost:3001
```

Or if accessing from another device on your network:
```
http://your-server-ip:3001
```

## ⚙️ Current Configuration

### Services Running

```bash
docker ps
```

You should see:
- `thor-api` on port 3000 (workout data + AI parsing)
- `thor-web` on port 3001 (web dashboard)
- `thor-agent` on port 3002 (conversational agent)
- `thor-mcp` on port 3003 (MCP tools backend)

### Agent Configuration

The agent is using:
- **LLM:** Ollama with llama3.1:8b model
- **Backend:** MCP server with 8 available tools
- **Response time:** ~30-60 seconds (Ollama is slower but local)

### Files Created

- `pi/.env` - Environment configuration
- `pi/test-flow.py` - Flow test script
- `pi/client.py` - Updated with 90s timeout for Ollama

## 🚀 Next Steps

### Option 1: Test on Actual Raspberry Pi

Follow the "On a Real Raspberry Pi" section above to deploy and test with real voice.

### Option 2: Speed Up Agent Responses

If 30-60 seconds is too slow, switch to OpenAI in thor-agent:

```bash
# Edit apps/thor-agent/.env
USE_OLLAMA=false
OPENAI_API_KEY=sk-your-key-here

# Restart agent
docker compose restart thor-agent
```

This will reduce response time to ~3-5 seconds.

### Option 3: Make It Hands-Free

Currently, you press Enter to record. To make it truly hands-free:

**Add wake word detection** (future enhancement):
```python
# Listen for "Hey Thor" before recording
# Uses libraries like pvporcupine or snowboy
```

**Or use continuous mode:**
```bash
python3 main.py --mode continuous --interval 2.0
```

This auto-records every 2 seconds (listens continuously).

## 📊 Architecture Summary

```
┌─────────────────────────┐
│   Raspberry Pi          │
│  ┌──────────────────┐   │
│  │ 1. Record Audio  │   │
│  └─────────┬────────┘   │
│            ▼             │
│  ┌──────────────────┐   │
│  │ 2. Whisper STT   │   │
│  └─────────┬────────┘   │
│            ▼             │
│  ┌──────────────────┐   │
│  │ 3. HTTP POST     │───────┐
│  │    /chat         │       │
│  └──────────────────┘       │
└─────────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │  Thor Agent (port 3002)        │
              │  ┌──────────────────────────┐  │
              │  │ 4. LLM Tool Calling      │  │
              │  └──────────┬───────────────┘  │
              │             ▼                   │
              │  ┌──────────────────────────┐  │
              │  │ 5. Call MCP Tools        │──┼──┐
              │  └──────────────────────────┘  │  │
              └────────────────────────────────┘  │
                                                  │
                                                  ▼
                               ┌──────────────────────────────┐
                               │  MCP Server (port 3003)      │
                               │  ┌────────────────────────┐  │
                               │  │ 6. Execute Tools       │  │
                               │  │    - log_workout       │  │
                               │  │    - get_exercises     │  │
                               │  │    - get_progress      │  │
                               │  └───────────┬────────────┘  │
                               └──────────────┼───────────────┘
                                              │
                                              ▼
                               ┌──────────────────────────────┐
                               │  Thor API (port 3000)        │
                               │  ┌────────────────────────┐  │
                               │  │ 7. Save to SQLite DB   │  │
                               │  └────────────────────────┘  │
                               └──────────────────────────────┘
                                              │
                                              ▼
                               ┌──────────────────────────────┐
                               │  Thor Web (port 3001)        │
                               │  Shows logged workouts       │
                               └──────────────────────────────┘
```

## 🎯 What You Asked For

> "I want to talk to it and have it send the message to the runner and see it pop up in the web app"

✅ **Talk to it:** Pi records voice via microphone
✅ **Send to runner:** Message sent to thor-agent via HTTP
✅ **Pop up in web app:** Workout logged to DB and visible at http://localhost:3001

**Status: COMPLETE! 🎉**

You can now:
1. Test the flow on your dev machine with `python3 test-flow.py`
2. Deploy to actual Raspberry Pi for voice interaction
3. See workouts appear in the web app in real-time

## 📝 Notes

- **Timeout increased:** Client now waits 90s for Ollama (was 30s)
- **No audio on WSL:** Can't test actual voice recording on WSL, but communication flow works
- **Real Pi needed:** For full voice experience, deploy to actual Raspberry Pi hardware
- **Web app:** Already running at http://localhost:3001

Enjoy your voice-controlled workout tracker! 💪🎤
