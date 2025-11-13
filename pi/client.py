"""
Thor Agent Client
Handles HTTP communication with the thor-agent service
"""

import requests
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class ThorAgentClient:
    """Client for communicating with Thor Agent service"""

    def __init__(self, agent_url: str, timeout: int = 30):
        """
        Initialize the agent client

        Args:
            agent_url: Base URL of the thor-agent service (e.g., http://localhost:3002)
            timeout: Request timeout in seconds
        """
        self.agent_url = agent_url.rstrip('/')
        self.timeout = timeout
        self.session_id: Optional[str] = None

    def send_message(self, message: str, reset: bool = False) -> Dict:
        """
        Send a message to the Thor agent

        Args:
            message: User message text
            reset: Whether to reset conversation history

        Returns:
            Dict with 'reply', 'sessionId', and optional 'toolCalls'

        Raises:
            requests.RequestException: If the request fails
        """
        url = f"{self.agent_url}/chat"

        payload = {
            "message": message,
            "reset": reset
        }

        # Include session ID if we have one
        if self.session_id and not reset:
            payload["sessionId"] = self.session_id

        logger.info(f"Sending message to agent: {message[:50]}...")

        try:
            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()

            data = response.json()

            # Store session ID for conversation continuity
            if "sessionId" in data:
                self.session_id = data["sessionId"]
                logger.debug(f"Session ID: {self.session_id}")

            logger.info(f"Received reply: {data.get('reply', '')[:50]}...")

            return data

        except requests.exceptions.Timeout:
            logger.error("Request to agent timed out")
            raise
        except requests.exceptions.ConnectionError:
            logger.error(f"Could not connect to agent at {self.agent_url}")
            raise
        except requests.exceptions.HTTPError as e:
            logger.error(f"Agent returned error: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error communicating with agent: {e}")
            raise

    def reset_conversation(self):
        """Reset the conversation session"""
        logger.info("Resetting conversation session")
        self.session_id = None

    def health_check(self) -> bool:
        """
        Check if the agent service is healthy

        Returns:
            True if service is healthy, False otherwise
        """
        url = f"{self.agent_url}/health"

        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()

            is_healthy = data.get("status") == "ok" and data.get("mcpReady", False)

            if is_healthy:
                logger.info("Agent service is healthy")
            else:
                logger.warning(f"Agent service health check failed: {data}")

            return is_healthy

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False


if __name__ == "__main__":
    # Test the client
    import sys

    logging.basicConfig(level=logging.INFO)

    agent_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3002"

    client = ThorAgentClient(agent_url)

    # Health check
    if not client.health_check():
        print("Agent service is not available!")
        sys.exit(1)

    # Test message
    response = client.send_message("What exercises should I do today?")
    print(f"\nReply: {response['reply']}")
