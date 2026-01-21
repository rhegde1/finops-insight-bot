#!/usr/bin/env python3
"""
Create / refresh an Azure AI Search index with live cost data from the Function App.

This enables portal grounding via the `azure_ai_search` tool once you attach the
index connection in AI Foundry.

Prereqs:
- pip install azure-search-documents requests
- Env vars:
  AZURE_SEARCH_ENDPOINT   (e.g., https://<service>.search.windows.net)
  AZURE_SEARCH_ADMIN_KEY  (admin key)
  SEARCH_INDEX_NAME       (optional, default: finops-costs)
  FUNCTION_APP_URL        (optional override; falls back to terraform output)

Workflow:
1) Pull cost snapshots from your Function App (summary/top/byTag/delta)
2) Create/merge an index with semantic configuration
3) Upload documents (one per snapshot)
"""

import os
import sys
import json
import subprocess
import time
from typing import Any, Dict, List

import requests
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SimpleField,
    SearchableField,
    SearchFieldDataType,
    SemanticConfiguration,
    SemanticField,
    SemanticSettings,
)


def load_terraform_function_url() -> str:
    try:
        result = subprocess.run(
            ["terraform", "output", "-raw", "function_app_url"],
            cwd="../terraform",
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except Exception:  # pylint: disable=broad-except
        return ""


def fetch_snapshots(function_app_url: str) -> List[Dict[str, Any]]:
    endpoints = {
        "summary_last30": ("/api/cost/summary", {"timeframe": "Last30Days"}),
        "summary_prev_month": ("/api/cost/summary", {"timeframe": "PreviousMonth"}),
        "top_last30": ("/api/cost/top", {"timeframe": "Last30Days", "top": 10}),
        "bytag_env": ("/api/cost/byTag", {"timeframe": "Last30Days", "tagKey": "environment"}),
        "delta_month": ("/api/cost/delta", {"currentPeriod": "MonthToDate", "comparisonPeriod": "PreviousMonth"}),
    }

    docs: List[Dict[str, Any]] = []
    for doc_id, (path, payload) in endpoints.items():
        url = f"{function_app_url}{path}"
        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            body = resp.json()
        except Exception as exc:  # pylint: disable=broad-except
            body = {"error": str(exc), "note": "fetch failed"}
        docs.append({
            "id": doc_id,
            "path": path,
            "payload": json.dumps(payload),
            "content": json.dumps(body),
            "timestamp": int(time.time()),
        })
    return docs


def build_index(name: str) -> SearchIndex:
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="path", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="payload", type=SearchFieldDataType.String, analyzer_name="en.lucene"),
        SearchableField(name="content", type=SearchFieldDataType.String, analyzer_name="en.lucene"),
        SimpleField(name="timestamp", type=SearchFieldDataType.Int64, filterable=True, sortable=True),
    ]

    semantic_config = SemanticConfiguration(
        name="finops-semantic",
        prioritized_fields=SemanticField(field_name="content")
    )

    return SearchIndex(
        name=name,
        fields=fields,
        semantic_settings=SemanticSettings(configurations=[semantic_config]),
    )


def ensure_index(endpoint: str, key: str, index: SearchIndex):
    idx_client = SearchIndexClient(endpoint=endpoint, credential=AzureKeyCredential(key))
    try:
        idx_client.create_index(index)
        print(f"Created index: {index.name}")
    except Exception:
        idx_client.delete_index(index.name)
        idx_client.create_index(index)
        print(f"Recreated index: {index.name}")


def upload_docs(endpoint: str, key: str, index_name: str, docs: List[Dict[str, Any]]):
    search_client = SearchClient(endpoint=endpoint, credential=AzureKeyCredential(key), index_name=index_name)
    result = search_client.upload_documents(docs)
    succeeded = sum(1 for r in result if r.succeeded)
    print(f"Uploaded {succeeded}/{len(docs)} documents")


def main():
    endpoint = os.environ.get("AZURE_SEARCH_ENDPOINT")
    admin_key = os.environ.get("AZURE_SEARCH_ADMIN_KEY")
    index_name = os.environ.get("SEARCH_INDEX_NAME", "finops-costs")
    function_app_url = os.environ.get("FUNCTION_APP_URL") or load_terraform_function_url()

    if not endpoint or not admin_key:
        print("ERROR: AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY are required")
        sys.exit(1)
    if not function_app_url:
        print("ERROR: FUNCTION_APP_URL not set and terraform output missing")
        sys.exit(1)

    print(f"Using search endpoint: {endpoint}")
    print(f"Index: {index_name}")
    print(f"Function App: {function_app_url}")

    docs = fetch_snapshots(function_app_url)
    index = build_index(index_name)
    ensure_index(endpoint, admin_key, index)
    upload_docs(endpoint, admin_key, index_name, docs)

    print("Done. Now create an Azure AI Search connection in your AI Project and attach this index to the agent.")
    print("Portal path: AI Foundry > Project > Settings > Connections > + New connection > Azure AI Search")
    print("Then edit the agent in portal and add Azure AI Search tool with this connection/index.")


if __name__ == "__main__":
    main()
