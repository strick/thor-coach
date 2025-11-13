# Thor Pi Voice Client

Voice-enabled frontend for the Thor workout tracking system. This Raspberry Pi client records voice input, transcribes it using Whisper, sends it to the Thor Agent, and speaks the response back.

---

## 🎤 Features

- **Voice Recording**: Record audio via USB microphone
- **Speech-to-Text**: Local Whisper or OpenAI Whisper API
- **Agent Integration**: Communicates with thor-agent service
- **Text-to-Speech**: Local TTS using pyttsx3 or espeak
- **Two Modes**:
  - **Interactive**: Press Enter to record (great for testing)
  - **Continuous**: Auto-record at intervals (hands-free)
- **Audio Feedback**: Beeps indicate recording start/stop/error
- **Modular Design**: Easy to extend for wake words, streaming, etc.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Raspberry Pi Voice Client       │
│  ┌──────────────────────────────────┐   │
│  │  1. Record Audio (USB Mic)       │   │
│  └────────────┬─────────────────────┘   │
│               ▼                          │
│  ┌──────────────────────────────────┐   │
│  │  2. STT (Whisper)                │   │
│  │     - Local: openai-whisper      │   │
│  │     - API: OpenAI Whisper API    │   │
│  └────────────┬─────────────────────┘   │
│               ▼                          │
│  ┌──────────────────────────────────┐   │
│  │  3. Send to Thor Agent           │   │
│  │     POST /chat                    │   │
│  └────────────┬─────────────────────┘   │
│               ▼                          │
│  ┌──────────────────────────────────┐   │
│  │  4. TTS (pyttsx3 / espeak)       │   │
│  └────────────┬─────────────────────┘   │
│               ▼                          │
│  ┌──────────────────────────────────┐   │
│  │  5. Play Audio (Speaker)         │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
                 │
                 │ HTTP
                 ▼
┌─────────────────────────────────────────┐
│         Thor Agent (Port 3002)          │
│  - LLM Tool Calling                     │
│  - MCP Backend                          │
│  - Conversation Memory                  │
└─────────────────────────────────────────┘
```

---

## 📦 Files

- **main.py** - Main orchestrator (record → STT → agent → TTS)
- **client.py** - HTTP client for thor-agent service
- **stt.py** - Whisper speech-to-text (local/API modes)
- **tts.py** - Text-to-speech engine
- **requirements.txt** - Python dependencies
- **.env.example** - Configuration template

---

## 🚀 Deployment to Raspberry Pi

### Prerequisites

- **Raspberry Pi** (3B+ or newer recommended)
- **Raspbian OS** (Bullseye or newer)
- **Python 3.8+** (comes with Raspbian)
- **USB Microphone** (any USB mic works)
- **Speaker** (USB, 3.5mm jack, or HDMI audio)
- **Network Connection** (to reach thor-agent service)

### Step 1: Prepare Raspberry Pi

Update system packages:

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

Install system dependencies:

```bash
# Audio libraries
sudo apt-get install -y portaudio19-dev python3-pyaudio

# TTS engine (optional: for espeak)
sudo apt-get install -y espeak

# Git (if not installed)
sudo apt-get install -y git

# Python development headers
sudo apt-get install -y python3-dev python3-pip python3-venv
```

### Step 2: Clone Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/thor-stack.git
cd thor-stack/pi
```

Or, if already cloned on another machine, use `rsync` to copy:

```bash
# From your development machine:
rsync -avz --exclude='node_modules' --exclude='dist' \
  /path/to/thor-stack/pi/ pi@raspberrypi.local:~/thor-stack/pi/
```

### Step 3: Set Up Python Virtual Environment

```bash
cd ~/thor-stack/pi

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip
```

### Step 4: Install Python Dependencies

**For API mode (lighter, recommended):**

```bash
pip install sounddevice numpy scipy soundfile requests python-dotenv pyttsx3 openai
```

**For local Whisper (heavier, slower on Pi):**

```bash
pip install -r requirements.txt
```

**Note**: Local Whisper requires significant CPU and may be slow on Raspberry Pi 3/4. Use API mode for better performance.

### Step 5: Configure Environment

```bash
cp .env.example .env
nano .env
```

Edit `.env` with your settings:

```env
# Thor Agent URL (replace with your server's IP if not localhost)
THOR_AGENT_URL=http://192.168.1.100:3002

# Use API mode for better performance on Pi
STT_MODE=api
OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# TTS engine
TTS_ENGINE=pyttsx3

# Audio settings
SAMPLE_RATE=16000
RECORD_DURATION=5.0
```

**Important**: If your thor-agent is running on another machine, replace `localhost` with the server's IP address.

### Step 6: Test Audio Devices

**List audio devices:**

```bash
python3 -c "import sounddevice as sd; print(sd.query_devices())"
```

**Test microphone recording:**

```bash
python3 -c "import sounddevice as sd; import numpy as np; \
  print('Recording...'); \
  audio = sd.rec(int(3 * 16000), samplerate=16000, channels=1); \
  sd.wait(); \
  print(f'Max amplitude: {np.max(np.abs(audio))}')"
```

Speak into the microphone. You should see a non-zero amplitude value.

### Step 7: Test Individual Components

**Test agent connectivity:**

```bash
source venv/bin/activate
python3 client.py http://192.168.1.100:3002
```

**Test TTS:**

```bash
python3 tts.py pyttsx3 "Hello from Thor Pi"
```

**Test STT (requires audio file or will use silence):**

```bash
python3 stt.py api
```

### Step 8: Run the Voice Client

**Interactive mode (press Enter to record):**

```bash
source venv/bin/activate
python3 main.py --mode interactive
```

**Continuous mode (auto-record every 2 seconds):**

```bash
python3 main.py --mode continuous --interval 2.0
```

**With custom settings:**

```bash
python3 main.py \
  --agent-url http://192.168.1.100:3002 \
  --stt-mode api \
  --tts-engine pyttsx3 \
  --record-duration 5.0 \
  --mode interactive
```

### Step 9: (Optional) Create Systemd Service for Auto-Start

Create a systemd service to run the client on boot:

```bash
sudo nano /etc/systemd/system/thor-pi-client.service
```

Add the following content:

```ini
[Unit]
Description=Thor Pi Voice Client
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/thor-stack/pi
Environment="PATH=/home/pi/thor-stack/pi/venv/bin"
ExecStart=/home/pi/thor-stack/pi/venv/bin/python3 /home/pi/thor-stack/pi/main.py --mode continuous --interval 2.0
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start the service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable thor-pi-client.service
sudo systemctl start thor-pi-client.service
```

**Check status:**

```bash
sudo systemctl status thor-pi-client.service
```

**View logs:**

```bash
sudo journalctl -u thor-pi-client.service -f
```

**Stop service:**

```bash
sudo systemctl stop thor-pi-client.service
```

---

## 🎛️ Configuration Options

### Environment Variables

All configuration can be set via `.env` or command-line arguments:

| Variable | Description | Default |
|----------|-------------|---------|
| `THOR_AGENT_URL` | Thor agent service URL | `http://localhost:3002` |
| `STT_MODE` | Whisper mode: `local` or `api` | `api` |
| `WHISPER_MODEL` | Local Whisper model size | `base` |
| `OPENAI_API_KEY` | OpenAI API key (for API mode) | - |
| `TTS_ENGINE` | TTS engine: `pyttsx3` or `espeak` | `pyttsx3` |
| `SAMPLE_RATE` | Audio sample rate in Hz | `16000` |
| `RECORD_DURATION` | Recording length in seconds | `5.0` |

### Command-Line Arguments

```bash
python3 main.py --help
```

Available options:
- `--agent-url URL` - Thor agent URL
- `--stt-mode {local,api}` - Whisper mode
- `--whisper-model SIZE` - Local model size
- `--tts-engine {pyttsx3,espeak}` - TTS engine
- `--sample-rate HZ` - Audio sample rate
- `--record-duration SECONDS` - Recording duration
- `--mode {interactive,continuous}` - Run mode
- `--interval SECONDS` - Continuous mode interval

---

## 🧪 Testing

### Manual Testing

1. **Start thor-agent on your server:**
   ```bash
   cd ~/thor-stack
   npm run dev:agent
   ```

2. **On Raspberry Pi, test interactive mode:**
   ```bash
   cd ~/thor-stack/pi
   source venv/bin/activate
   python3 main.py --mode interactive
   ```

3. **Press Enter and say:**
   - "What exercises should I do today?"
   - "Log my workout: 3 sets of 12 reps shoulder press at 30 pounds"

### Troubleshooting

**Problem: "Agent is not available"**
- Check network connectivity: `ping <agent-server-ip>`
- Verify thor-agent is running: `curl http://<agent-ip>:3002/health`
- Check firewall settings on server

**Problem: "No audio detected"**
- Test microphone: `arecord -d 3 test.wav && aplay test.wav`
- Check USB mic is recognized: `lsusb`
- Verify audio device with `sounddevice.query_devices()`

**Problem: "Transcription failed"**
- For API mode: Check `OPENAI_API_KEY` is set
- For local mode: Try smaller model (e.g., `tiny` or `base`)
- Check audio is not silent

**Problem: "TTS not working"**
- For pyttsx3: `pip install --upgrade pyttsx3`
- For espeak: `sudo apt-get install espeak`
- Test speaker: `speaker-test -t wav -c 2`

**Problem: CPU too high with local Whisper**
- Switch to API mode: `--stt-mode api`
- Use smaller model: `--whisper-model tiny`
- Reduce sample rate: `--sample-rate 8000` (lower quality)

---

## 🔮 Future Enhancements

The code is structured to easily add:

### Wake Word Detection
```python
# In main.py, add wake word listener before recording
from pvporcupine import Porcupine

# Listen for "Hey Thor" before activating recording
```

### Streaming STT
```python
# Replace batch recording with streaming audio
import pyaudio

# Stream audio chunks to Whisper in real-time
```

### Local LLM (Ollama on Pi)
```python
# Run Ollama directly on Pi (Pi 5 recommended)
# Modify client.py to support local LLM endpoint
```

### Home Assistant Integration
```python
# Add MCP client to communicate with Home Assistant
# Control lights, thermostats during workout
```

### Multi-User Support
```python
# Add voice recognition to identify user
# Maintain separate sessions per user
```

---

## 📊 Performance Notes

### Raspberry Pi 3B+/4
- **API Mode**: Works well, ~2-3 second response time
- **Local Whisper (base)**: Slow (~10-20 seconds for transcription)
- **Local Whisper (tiny)**: Acceptable (~3-5 seconds)

### Raspberry Pi 5
- **API Mode**: Very fast
- **Local Whisper (base)**: Usable (~3-5 seconds)
- **Local Whisper (small)**: Good balance

### Recommendations
- **Use API mode** for best performance
- **Use local mode** only if you need offline capability
- **Use `tiny` or `base` models** for local Whisper on Pi

---

## 🔧 Maintenance

### Update Dependencies

```bash
cd ~/thor-stack/pi
source venv/bin/activate
pip install --upgrade -r requirements.txt
```

### Update Code

```bash
cd ~/thor-stack
git pull origin main
```

### View Logs (if running as service)

```bash
sudo journalctl -u thor-pi-client.service -f
```

### Restart Service

```bash
sudo systemctl restart thor-pi-client.service
```

---

## 🤝 Contributing

This Pi client is part of the Thor Stack monorepo. See main README for contribution guidelines.

---

## 📄 License

MIT (same as Thor Stack)

---

## 🎯 Quick Start Summary

```bash
# 1. Install system dependencies
sudo apt-get update
sudo apt-get install -y portaudio19-dev python3-pyaudio espeak

# 2. Set up Python environment
cd ~/thor-stack/pi
python3 -m venv venv
source venv/bin/activate

# 3. Install Python packages (API mode)
pip install sounddevice numpy scipy soundfile requests python-dotenv pyttsx3 openai

# 4. Configure
cp .env.example .env
nano .env  # Set THOR_AGENT_URL and OPENAI_API_KEY

# 5. Run
python3 main.py --mode interactive
```

**That's it!** Press Enter, speak your workout, and Thor will respond.
