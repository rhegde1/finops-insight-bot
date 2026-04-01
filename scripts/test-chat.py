#!/usr/bin/env python3
"""
Test the /api/chat endpoint of the FinOps Cost Agent.

Usage:
  python scripts/test-chat.py
  python scripts/test-chat.py --url https://your-function-app.azurewebsites.net
"""

import argparse
import json
import subprocess
import sys

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)


def get_function_url() -> str:
    """Get function app URL from Terraform outputs."""
    try:
        result = subprocess.run(
            ["terraform", "output", "-raw", "function_app_url"],
            cwd="terraform",
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def test_chat(base_url: str, message: str, history: list = None):
    """Send a chat message and print the response."""
    url = f"{base_url}/api/chat"
    payload = {"message": message}
    if history:
        payload["history"] = history

    print(f"\n{'='*60}")
    print(f"User: {message}")
    print(f"{'='*60}")

    try:
        resp = requests.post(url, json=payload, timeout=60)
        if not resp.ok:
            print(f"ERROR: HTTP {resp.status_code}")
            print(resp.text)
            return None

        data = resp.json()
        reply = data.get("reply", "No reply")
        usage = data.get("usage")

        print(f"\nAssistant:\n{reply}")
        if usage:
            print(f"\n[Tokens: {usage.get('total_tokens', '?')}]")

        return {"role": "assistant", "content": reply}

    except requests.exceptions.ConnectionError:
        print(f"ERROR: Cannot connect to {url}")
        print("Is the Function App running?")
        return None
    except Exception as e:
        print(f"ERROR: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Test FinOps Chat API")
    parser.add_argument("--url", help="Function App base URL")
    args = parser.parse_args()

    base_url = args.url or get_function_url()
    if not base_url:
        print("ERROR: No Function App URL. Use --url or run from repo root with Terraform outputs.")
        sys.exit(1)

    print(f"Testing: {base_url}/api/chat")

    # Test 1: Basic cost query
    test_chat(base_url, "What were my total Azure costs for the last 30 days?")

    # Test 2: Top resources
    test_chat(base_url, "Show me the top 5 most expensive resources this month")

    # Test 3: Comparison
    test_chat(base_url, "Compare this week's costs to last week")

    print(f"\n{'='*60}")
    print("All tests completed.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
