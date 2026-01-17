#!/usr/bin/env python3
"""
Test script for Meta-Runner with model visibility
Demonstrates the new model/provider tracking feature
"""

import logging
import sys
from meta_runner_client import MetaRunnerClient

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default to localhost, but can be overridden via command line
META_RUNNER_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3004"


def test_meta_runner():
    """
    Test Meta-Runner with model visibility
    Shows how agent, intent, and model information is displayed
    """

    print("\n" + "="*70)
    print("🤖 META-RUNNER MODEL VISIBILITY TEST")
    print("="*70)
    print(f"\nMeta-Runner URL: {META_RUNNER_URL}")
    print("\nThis test demonstrates the new model tracking feature:")
    print("• Shows which agent handled the request (thor, nutrition, health)")
    print("• Shows the intent classification (log_workout, get_plan, etc.)")
    print("• Shows which LLM model was used (ollama/llama3.1:8b, openai/gpt-4, etc.)")
    print("="*70 + "\n")

    # Create client
    client = MetaRunnerClient(META_RUNNER_URL, timeout=90)

    # Health check
    print("1️⃣  Checking meta-runner health...")
    if not client.health_check():
        print("❌ Meta-runner service is not available!")
        print(f"   Make sure it's running: docker ps | grep meta-runner")
        sys.exit(1)

    print("✅ Meta-runner is healthy\n")

    # Test different types of queries
    test_cases = [
        {
            "query": "What exercises should I do today?",
            "description": "Query today's workout plan",
            "expected_agent": "thor",
            "expected_intent": "get_plan"
        },
        {
            "query": "Log my workout: floor press 4x12 @45, skullcrusher 3x10 @20",
            "description": "Log a workout",
            "expected_agent": "thor",
            "expected_intent": "log_workout"
        },
        {
            "query": "I ate a chicken salad for lunch",
            "description": "Log a meal",
            "expected_agent": "nutrition",
            "expected_intent": "log_meal"
        },
        {
            "query": "I had a migraine today",
            "description": "Log a health event",
            "expected_agent": "health",
            "expected_intent": "log_event"
        }
    ]

    for i, test_case in enumerate(test_cases, start=2):
        print(f"{i}️⃣  Test: {test_case['description']}")
        print(f"   Query: \"{test_case['query']}\"")
        print(f"   Expected: agent={test_case['expected_agent']}, intent={test_case['expected_intent']}")
        print()

        try:
            response = client.send_message(test_case['query'])

            # Display formatted response with model info
            print(client.format_response(response))

            # Verify routing
            actual_agent = response.get('agent', 'unknown')
            actual_intent = response.get('intent', 'unknown')

            if actual_agent == test_case['expected_agent'] and actual_intent == test_case['expected_intent']:
                print("   ✅ Routing: CORRECT")
            else:
                print(f"   ⚠️  Routing mismatch: got {actual_agent}/{actual_intent}")

            # Show model info prominently
            model = response.get('model', 'unknown')
            provider = response.get('provider', 'unknown')
            print(f"   🤖 LLM Used: {provider}/{model}")

        except Exception as e:
            print(f"   ❌ Error: {e}")

        print("\n" + "-"*70 + "\n")

    # Summary
    print("="*70)
    print("✅ MODEL VISIBILITY TEST COMPLETE")
    print("="*70)
    print("\n📊 What you should see:")
    print("• Each response shows: Agent | Intent | Model")
    print("• Model format: provider/model (e.g., ollama/llama3.1:8b)")
    print("• This info is now available in both terminal logs and API responses")
    print("\n💡 This feature helps you:")
    print("• Understand which model handled each request")
    print("• Debug performance issues (which model is slow?)")
    print("• Optimize costs (use faster/cheaper models for simple tasks)")
    print("="*70 + "\n")


if __name__ == "__main__":
    test_meta_runner()
