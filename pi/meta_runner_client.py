"""
Meta-Runner Client
Handles HTTP communication with the meta-runner service
"""

import requests
import logging
from typing import Dict

logger = logging.getLogger(__name__)


class MetaRunnerClient:
    """Client for communicating with Meta-Runner service"""

    def __init__(self, meta_runner_url: str, timeout: int = 90):
        """
        Initialize the meta-runner client

        Args:
            meta_runner_url: Base URL of the meta-runner service (e.g., http://localhost:3004)
            timeout: Request timeout in seconds (default 90 for Ollama)
        """
        self.meta_runner_url = meta_runner_url.rstrip('/')
        self.timeout = timeout

    def send_message(self, text: str, mode: str = "auto") -> Dict:
        """
        Send a message to the Meta-Runner

        Args:
            text: User message text
            mode: Routing mode ("auto", "thor", "nutrition", "health", "overview")

        Returns:
            Dict with 'agent', 'intent', 'actions', 'message', 'model', 'provider'

        Raises:
            requests.RequestException: If the request fails
        """
        url = f"{self.meta_runner_url}/chat"

        payload = {
            "text": text,
            "mode": mode
        }

        logger.info(f"Sending message to meta-runner: {text[:50]}...")

        try:
            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()

            data = response.json()

            # Log and return response with model info
            agent = data.get("agent", "unknown")
            intent = data.get("intent", "unknown")
            message = data.get("message", "")
            model = data.get("model", "unknown")
            provider = data.get("provider", "unknown")

            logger.info(f"Agent: {agent} | Intent: {intent} | Model: {provider}/{model}")
            logger.info(f"Response: {message[:100]}...")

            return data

        except requests.exceptions.Timeout:
            logger.error("Request to meta-runner timed out")
            raise
        except requests.exceptions.ConnectionError:
            logger.error(f"Could not connect to meta-runner at {self.meta_runner_url}")
            raise
        except requests.exceptions.HTTPError as e:
            logger.error(f"Meta-runner returned error: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error communicating with meta-runner: {e}")
            raise

    def health_check(self) -> bool:
        """
        Check if the meta-runner service is healthy

        Returns:
            True if service is healthy, False otherwise
        """
        url = f"{self.meta_runner_url}/health"

        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()

            is_healthy = data.get("status") == "ok"

            if is_healthy:
                logger.info("Meta-runner service is healthy")
            else:
                logger.warning(f"Meta-runner service health check failed: {data}")

            return is_healthy

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    def format_response(self, data: Dict) -> str:
        """
        Format the meta-runner response for display

        Args:
            data: Response data from meta-runner

        Returns:
            Formatted string with agent, intent, model, and message
        """
        agent = data.get("agent", "unknown")
        intent = data.get("intent", "unknown")
        model = data.get("model", "unknown")
        provider = data.get("provider", "unknown")
        message = data.get("message", "")

        # Format header with metadata
        header = f"Agent: {agent} | Intent: {intent} | Model: {provider}/{model}"
        separator = "=" * len(header)

        return f"\n{separator}\n{header}\n{separator}\n\n{message}\n"


if __name__ == "__main__":
    # Test the client
    import sys

    logging.basicConfig(level=logging.INFO)

    meta_runner_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3004"

    client = MetaRunnerClient(meta_runner_url)

    # Health check
    if not client.health_check():
        print("Meta-runner service is not available!")
        sys.exit(1)

    # Test message
    print("\n" + "="*70)
    print("Testing Meta-Runner Client")
    print("="*70)

    test_queries = [
        "What exercises should I do today?",
        "Log my workout: floor press 4x12 @45",
        "What did I eat yesterday?",
        "Show me my progress for the last 30 days"
    ]

    for query in test_queries:
        print(f"\n📝 Query: {query}")
        try:
            response = client.send_message(query)
            print(client.format_response(response))
        except Exception as e:
            print(f"❌ Error: {e}")
        print()
