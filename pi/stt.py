"""
Speech-to-Text (STT) Module
Supports both local Whisper and OpenAI Whisper API
"""

import os
import logging
import tempfile
import soundfile as sf
import numpy as np
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class WhisperSTT:
    """Speech-to-Text using Whisper (local or API)"""

    def __init__(
        self,
        mode: str = "api",
        model_size: str = "base",
        api_key: Optional[str] = None,
        language: str = "en"
    ):
        """
        Initialize Whisper STT

        Args:
            mode: "local" for local Whisper, "api" for OpenAI API
            model_size: Whisper model size (tiny/base/small/medium/large) - only for local
            api_key: OpenAI API key (required for API mode)
            language: Language code (e.g., "en" for English)
        """
        self.mode = mode
        self.model_size = model_size
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.language = language
        self.model = None

        if mode == "local":
            self._init_local_whisper()
        elif mode == "api":
            self._init_api_whisper()
        else:
            raise ValueError(f"Invalid mode: {mode}. Must be 'local' or 'api'")

    def _init_local_whisper(self):
        """Initialize local Whisper model"""
        try:
            import whisper
            logger.info(f"Loading Whisper model: {self.model_size}")
            self.model = whisper.load_model(self.model_size)
            logger.info("Local Whisper model loaded successfully")
        except ImportError:
            raise ImportError(
                "openai-whisper not installed. Install with: pip install openai-whisper"
            )
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    def _init_api_whisper(self):
        """Initialize OpenAI Whisper API client"""
        if not self.api_key:
            raise ValueError(
                "OPENAI_API_KEY not found. Set it in .env or pass as argument."
            )

        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=self.api_key)
            logger.info("OpenAI Whisper API client initialized")
        except ImportError:
            raise ImportError(
                "openai package not installed. Install with: pip install openai"
            )

    def transcribe_audio(self, audio_data: np.ndarray, sample_rate: int) -> str:
        """
        Transcribe audio data to text

        Args:
            audio_data: Audio samples as numpy array
            sample_rate: Sample rate of the audio

        Returns:
            Transcribed text
        """
        if self.mode == "local":
            return self._transcribe_local(audio_data, sample_rate)
        else:
            return self._transcribe_api(audio_data, sample_rate)

    def _transcribe_local(self, audio_data: np.ndarray, sample_rate: int) -> str:
        """Transcribe using local Whisper model"""
        try:
            logger.info("Transcribing with local Whisper...")

            # Whisper expects float32 audio normalized to [-1, 1]
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)

            # Normalize if needed
            if audio_data.max() > 1.0:
                audio_data = audio_data / np.max(np.abs(audio_data))

            # Whisper expects 16kHz audio
            if sample_rate != 16000:
                logger.warning(f"Resampling from {sample_rate}Hz to 16000Hz")
                # Simple resampling (for production, use scipy.signal.resample)
                from scipy import signal
                num_samples = int(len(audio_data) * 16000 / sample_rate)
                audio_data = signal.resample(audio_data, num_samples)

            # Transcribe
            result = self.model.transcribe(
                audio_data,
                language=self.language,
                fp16=False  # Use fp32 for better CPU compatibility
            )

            text = result["text"].strip()
            logger.info(f"Transcription: {text}")

            return text

        except Exception as e:
            logger.error(f"Local transcription failed: {e}")
            raise

    def _transcribe_api(self, audio_data: np.ndarray, sample_rate: int) -> str:
        """Transcribe using OpenAI Whisper API"""
        try:
            logger.info("Transcribing with OpenAI Whisper API...")

            # Save audio to temporary WAV file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                tmp_path = tmp_file.name

            # Write audio to file
            sf.write(tmp_path, audio_data, sample_rate)

            try:
                # Transcribe via API
                with open(tmp_path, "rb") as audio_file:
                    transcript = self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        language=self.language
                    )

                text = transcript.text.strip()
                logger.info(f"Transcription: {text}")

                return text

            finally:
                # Clean up temp file
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        except Exception as e:
            logger.error(f"API transcription failed: {e}")
            raise


if __name__ == "__main__":
    # Test STT with a dummy audio clip
    import sys

    logging.basicConfig(level=logging.INFO)

    mode = sys.argv[1] if len(sys.argv) > 1 else "api"

    # Create dummy audio (1 second of silence)
    sample_rate = 16000
    duration = 1.0
    audio_data = np.zeros(int(sample_rate * duration), dtype=np.float32)

    try:
        stt = WhisperSTT(mode=mode, model_size="base")
        text = stt.transcribe_audio(audio_data, sample_rate)
        print(f"Transcribed: {text}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
