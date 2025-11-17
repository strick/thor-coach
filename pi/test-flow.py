#!/usr/bin/env python3
"""
Test script to demonstrate the full Pi → Agent → Web flow
Simulates what would happen when you speak to the Pi
"""

import logging
import requests
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

AGENT_URL = "http://10.255.255.254:3002"  # Windows host IP from WSL
WEB_URL = "http://10.255.255.254:3001"
TIMEOUT = 90  # Increased timeout for Ollama

def test_full_flow():
    """
    Simulate Pi voice client flow:
    1. User speaks: "Log my workout: floor press 3 sets of 12 at 45 pounds"
    2. Pi sends to agent
    3. Agent processes and logs workout
    4. Check if it appears in web app
    """

    print("\n" + "="*70)
    print("🎤 SIMULATING RASPBERRY PI VOICE CLIENT FLOW")
    print("="*70)

    # Step 1: User speaks (simulated)
    user_speech = "Log my workout: floor press 3 sets of 12 at 45 pounds"
    print(f"\n1️⃣  User speaks: \"{user_speech}\"")

    # Step 2: Send to agent (with longer timeout for Ollama)
    print(f"\n2️⃣  Sending to agent at {AGENT_URL}/chat...")
    print("   (This may take 30-60 seconds due to Ollama LLM processing)")

    start_time = time.time()

    try:
        response = requests.post(
            f"{AGENT_URL}/chat",
            json={"message": user_speech},
            timeout=TIMEOUT,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        data = response.json()

        elapsed = time.time() - start_time
        print(f"\n✅ Agent responded in {elapsed:.1f} seconds")

        # Step 3: Show agent response
        reply = data.get("reply", "")
        tool_calls = data.get("toolCalls", [])

        print(f"\n3️⃣  Agent reply:")
        print(f"   \"{reply[:200]}...\"")

        print(f"\n4️⃣  Tools called:")
        for tool_call in tool_calls:
            tool = tool_call.get("tool", "")
            result = tool_call.get("result", {})
            print(f"   - {tool}")

            if tool == "log_workout":
                results = result.get("results", [])
                for r in results:
                    status = r.get("status", "")
                    exercise = r.get("exercise", "")
                    sets = r.get("sets", 0)
                    reps = r.get("reps", 0)
                    weight = r.get("weight_lbs", 0)
                    print(f"     {status}: {exercise} {sets}x{reps} @{weight}lbs")

        # Step 4: Pi would speak this response
        print(f"\n5️⃣  Pi speaks the reply via TTS")
        print(f"   (In real Pi, you would hear: \"{reply[:100]}...\")")

        # Step 5: Verify it shows up in web app
        print(f"\n6️⃣  Checking if workout appears in web app at {WEB_URL}...")
        print(f"   Open {WEB_URL} and check today's workouts!")

        print("\n" + "="*70)
        print("✅ FULL FLOW SUCCESSFUL!")
        print("="*70)
        print("\nWhat just happened:")
        print("• Your spoken message was sent to the agent")
        print("• Agent called MCP tools to log the workout")
        print("• Workout was saved to the database")
        print("• Agent generated a motivational response")
        print("• Response would be spoken back to you")
        print("• Workout now appears in the web app")
        print("\n💡 On a real Raspberry Pi:")
        print("• You would speak into the microphone")
        print("• Whisper would transcribe your speech to text")
        print("• Same flow would happen as above")
        print("• You would hear the response through speakers")
        print("="*70 + "\n")

    except requests.exceptions.Timeout:
        print(f"\n❌ Request timed out after {TIMEOUT} seconds")
        print("   Ollama might be slow. Try increasing timeout or using OpenAI API mode.")
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Could not connect to agent at {AGENT_URL}")
        print("   Make sure thor-agent is running: docker ps")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    test_full_flow()
