"""
Text-to-Speech (TTS) Module
Converts text to audio and plays it back
"""

import logging
import tempfile
import os
from typing import Optional
import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


class TTS:
    """Text-to-Speech engine"""

    def __init__(self, engine: str = "pyttsx3", rate: int = 150, volume: float = 0.9):
        """
        Initialize TTS engine

        Args:
            engine: TTS engine to use ("pyttsx3" or "espeak")
            rate: Speech rate (words per minute)
            volume: Volume level (0.0 to 1.0)
        """
        self.engine_name = engine
        self.rate = rate
        self.volume = volume
        self.engine = None

        if engine == "pyttsx3":
            self._init_pyttsx3()
        elif engine == "espeak":
            self._init_espeak()
        else:
            raise ValueError(f"Unsupported engine: {engine}")

    def _init_pyttsx3(self):
        """Initialize pyttsx3 TTS engine"""
        try:
            import pyttsx3
            self.engine = pyttsx3.init()
            self.engine.setProperty('rate', self.rate)
            self.engine.setProperty('volume', self.volume)
            logger.info("pyttsx3 TTS engine initialized")
        except ImportError:
            raise ImportError(
                "pyttsx3 not installed. Install with: pip install pyttsx3"
            )
        except Exception as e:
            logger.error(f"Failed to initialize pyttsx3: {e}")
            raise

    def _init_espeak(self):
        """Initialize espeak TTS (command-line based)"""
        import shutil

        # Check if espeak is installed
        if not shutil.which("espeak"):
            raise RuntimeError(
                "espeak not found. Install with: sudo apt-get install espeak"
            )

        logger.info("espeak TTS engine initialized")

    def speak(self, text: str, blocking: bool = True):
        """
        Convert text to speech and play it

        Args:
            text: Text to speak
            blocking: If True, wait for speech to complete before returning
        """
        if not text or not text.strip():
            logger.warning("Empty text provided to TTS")
            return

        logger.info(f"Speaking: {text[:50]}...")

        try:
            if self.engine_name == "pyttsx3":
                self._speak_pyttsx3(text, blocking)
            elif self.engine_name == "espeak":
                self._speak_espeak(text, blocking)
        except Exception as e:
            logger.error(f"TTS failed: {e}")
            raise

    def _speak_pyttsx3(self, text: str, blocking: bool):
        """Speak using pyttsx3"""
        self.engine.say(text)

        if blocking:
            self.engine.runAndWait()
        else:
            # Run in separate thread for non-blocking
            import threading
            threading.Thread(target=self.engine.runAndWait, daemon=True).start()

    def _speak_espeak(self, text: str, blocking: bool):
        """Speak using espeak command-line tool"""
        import subprocess

        cmd = [
            "espeak",
            "-v", "en",  # English voice
            "-s", str(self.rate),  # Speed
            "-a", str(int(self.volume * 200)),  # Amplitude (0-200)
            text
        ]

        if blocking:
            subprocess.run(cmd, check=True)
        else:
            subprocess.Popen(cmd)

    def stop(self):
        """Stop current speech"""
        if self.engine_name == "pyttsx3" and self.engine:
            try:
                self.engine.stop()
                logger.info("Speech stopped")
            except Exception as e:
                logger.warning(f"Failed to stop speech: {e}")


class BeepGenerator:
    """Generate beep sounds for feedback"""

    @staticmethod
    def play_beep(frequency: int = 440, duration: float = 0.2, volume: float = 0.3):
        """
        Play a simple beep tone

        Args:
            frequency: Frequency in Hz
            duration: Duration in seconds
            volume: Volume level (0.0 to 1.0)
        """
        try:
            sample_rate = 44100
            t = np.linspace(0, duration, int(sample_rate * duration), False)
            tone = np.sin(frequency * 2 * np.pi * t) * volume

            sd.play(tone, sample_rate)
            sd.wait()
        except Exception as e:
            logger.warning(f"Failed to play beep: {e}")

    @staticmethod
    def play_start_beep():
        """Play beep to indicate recording start"""
        BeepGenerator.play_beep(880, 0.1, 0.3)

    @staticmethod
    def play_stop_beep():
        """Play beep to indicate recording stop"""
        BeepGenerator.play_beep(440, 0.15, 0.3)

    @staticmethod
    def play_error_beep():
        """Play beep to indicate error"""
        BeepGenerator.play_beep(220, 0.3, 0.4)


if __name__ == "__main__":
    # Test TTS
    import sys

    logging.basicConfig(level=logging.INFO)

    engine = sys.argv[1] if len(sys.argv) > 1 else "pyttsx3"
    text = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "Hello from Thor Pi client"

    try:
        tts = TTS(engine=engine)
        tts.speak(text)
        print("TTS test completed")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
