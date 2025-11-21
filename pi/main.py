#!/usr/bin/env python3
"""
Thor Pi Voice Client
Main orchestrator for the voice interaction pipeline
"""

import os
import sys
import logging
import argparse
import time
import signal
from pathlib import Path
from typing import Optional

import numpy as np
import sounddevice as sd
from dotenv import load_dotenv

from client import ThorAgentClient
from stt import WhisperSTT
from tts import TTS, BeepGenerator

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ThorPiClient:
    """Main Thor Pi voice client"""

    def __init__(
        self,
        agent_url: str,
        stt_mode: str = "api",
        whisper_model: str = "base",
        tts_engine: str = "pyttsx3",
        sample_rate: int = 16000,
        record_duration: float = 5.0
    ):
        """
        Initialize Thor Pi Client

        Args:
            agent_url: URL of the thor-agent service
            stt_mode: "local" or "api" for Whisper
            whisper_model: Whisper model size (for local mode)
            tts_engine: "pyttsx3" or "espeak"
            sample_rate: Audio sample rate in Hz
            record_duration: Recording duration in seconds
        """
        self.agent_url = agent_url
        self.sample_rate = sample_rate
        self.record_duration = record_duration
        self.running = False

        logger.info("Initializing Thor Pi Client...")

        # Initialize agent client
        self.agent = ThorAgentClient(agent_url)

        # Initialize STT
        logger.info(f"Initializing STT (mode: {stt_mode})...")
        self.stt = WhisperSTT(
            mode=stt_mode,
            model_size=whisper_model,
            api_key=os.getenv("OPENAI_API_KEY")
        )

        # Initialize TTS
        logger.info(f"Initializing TTS (engine: {tts_engine})...")
        self.tts = TTS(engine=tts_engine)

        logger.info("Thor Pi Client initialized successfully!")

    def record_audio(self) -> Optional[np.ndarray]:
        """
        Record audio from microphone

        Returns:
            Audio data as numpy array, or None if recording failed
        """
        try:
            logger.info(f"Recording for {self.record_duration} seconds...")

            # Play start beep
            BeepGenerator.play_start_beep()

            # Record audio
            audio_data = sd.rec(
                int(self.record_duration * self.sample_rate),
                samplerate=self.sample_rate,
                channels=1,
                dtype=np.float32
            )
            sd.wait()  # Wait for recording to complete

            # Play stop beep
            BeepGenerator.play_stop_beep()

            logger.info("Recording complete")

            # Flatten to 1D array
            return audio_data.flatten()

        except Exception as e:
            logger.error(f"Recording failed: {e}")
            BeepGenerator.play_error_beep()
            return None

    def process_voice_interaction(self):
        """
        Process one complete voice interaction cycle:
        1. Record audio
        2. Transcribe to text
        3. Send to agent
        4. Speak response
        """
        try:
            # Step 1: Record audio
            audio_data = self.record_audio()
            if audio_data is None:
                logger.error("Failed to record audio")
                return

            # Check if audio is silent (all zeros or very low amplitude)
            if np.max(np.abs(audio_data)) < 0.01:
                logger.warning("No audio detected (too quiet or silent)")
                self.tts.speak("I didn't hear anything. Please try again.")
                return

            # Step 2: Transcribe audio
            logger.info("Transcribing audio...")
            try:
                text = self.stt.transcribe_audio(audio_data, self.sample_rate)
            except Exception as e:
                logger.error(f"Transcription failed: {e}")
                self.tts.speak("Sorry, I couldn't understand that.")
                return

            if not text or len(text.strip()) < 2:
                logger.warning("Transcription returned empty or very short text")
                self.tts.speak("I didn't catch that. Please speak clearly.")
                return

            logger.info(f"You said: {text}")

            # Step 3: Send to agent
            logger.info("Sending to agent...")
            try:
                response = self.agent.send_message(text)
                reply = response.get("reply", "")
            except Exception as e:
                logger.error(f"Agent communication failed: {e}")
                self.tts.speak("Sorry, I couldn't reach the workout server.")
                return

            if not reply:
                logger.warning("Agent returned empty response")
                self.tts.speak("Sorry, I didn't get a response.")
                return

            logger.info(f"Agent replied: {reply}")

            # Step 4: Speak response
            self.tts.speak(reply)

        except KeyboardInterrupt:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in voice interaction: {e}")
            BeepGenerator.play_error_beep()

    def run_interactive(self):
        """
        Run in interactive mode: press Enter to record
        """
        self.running = True

        print("\n" + "="*60)
        print("Thor Pi Voice Client - Interactive Mode")
        print("="*60)
        print(f"Agent URL: {self.agent_url}")
        print(f"Recording duration: {self.record_duration}s")
        print(f"Sample rate: {self.sample_rate}Hz")
        print()
        print("Press ENTER to start recording")
        print("Press Ctrl+C to quit")
        print("="*60 + "\n")

        # Check agent health
        if not self.agent.health_check():
            logger.error("Agent is not available!")
            print("❌ Agent service is not available. Please start thor-agent first.")
            return

        print("✅ Agent service is healthy\n")

        try:
            while self.running:
                # Wait for user input
                input("Press ENTER to speak... ")

                # Process interaction
                self.process_voice_interaction()

                print()  # Blank line for readability

        except KeyboardInterrupt:
            print("\n\nShutting down...")
            self.running = False

    def run_continuous(self, interval: float = 1.0):
        """
        Run in continuous mode: automatically record at intervals

        Args:
            interval: Seconds to wait between recordings
        """
        self.running = True

        print("\n" + "="*60)
        print("Thor Pi Voice Client - Continuous Mode")
        print("="*60)
        print(f"Agent URL: {self.agent_url}")
        print(f"Recording duration: {self.record_duration}s")
        print(f"Interval: {interval}s")
        print()
        print("Press Ctrl+C to quit")
        print("="*60 + "\n")

        # Check agent health
        if not self.agent.health_check():
            logger.error("Agent is not available!")
            print("❌ Agent service is not available. Please start thor-agent first.")
            return

        print("✅ Agent service is healthy\n")

        try:
            while self.running:
                self.process_voice_interaction()
                time.sleep(interval)

        except KeyboardInterrupt:
            print("\n\nShutting down...")
            self.running = False


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Thor Pi Voice Client")

    # Agent configuration
    parser.add_argument(
        "--agent-url",
        default=os.getenv("META_RUNNER_URL", "http://localhost:3001"),
        help="Meta-runner URL (default: http://localhost:3001)"
    )

    # STT configuration
    parser.add_argument(
        "--stt-mode",
        choices=["local", "api"],
        default=os.getenv("STT_MODE", "api"),
        help="Whisper mode: local or api (default: api)"
    )
    parser.add_argument(
        "--whisper-model",
        default=os.getenv("WHISPER_MODEL", "base"),
        help="Whisper model size for local mode (default: base)"
    )

    # TTS configuration
    parser.add_argument(
        "--tts-engine",
        choices=["pyttsx3", "espeak"],
        default=os.getenv("TTS_ENGINE", "pyttsx3"),
        help="TTS engine (default: pyttsx3)"
    )

    # Audio configuration
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=int(os.getenv("SAMPLE_RATE", "16000")),
        help="Audio sample rate in Hz (default: 16000)"
    )
    parser.add_argument(
        "--record-duration",
        type=float,
        default=float(os.getenv("RECORD_DURATION", "5.0")),
        help="Recording duration in seconds (default: 5.0)"
    )

    # Mode
    parser.add_argument(
        "--mode",
        choices=["interactive", "continuous"],
        default="interactive",
        help="Run mode: interactive (press enter) or continuous (auto-record)"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Interval between recordings in continuous mode (default: 1.0)"
    )

    args = parser.parse_args()

    try:
        # Create client
        client = ThorPiClient(
            agent_url=args.agent_url,
            stt_mode=args.stt_mode,
            whisper_model=args.whisper_model,
            tts_engine=args.tts_engine,
            sample_rate=args.sample_rate,
            record_duration=args.record_duration
        )

        # Run in selected mode
        if args.mode == "interactive":
            client.run_interactive()
        else:
            client.run_continuous(args.interval)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
