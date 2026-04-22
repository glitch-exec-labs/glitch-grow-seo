"""
Natural Language API — entity extraction on page content.

Uses the official `google-cloud-language` client. SA needs the
Natural Language API enabled on the project; no per-property IAM.
"""
from __future__ import annotations

from google.cloud import language_v2

from .auth import credentials


def client() -> language_v2.LanguageServiceClient:
    return language_v2.LanguageServiceClient(credentials=credentials("language"))


def analyze_entities(text: str) -> dict:
    """Return the API response as a plain dict."""
    c = client()
    document = language_v2.Document(
        content=text,
        type_=language_v2.Document.Type.PLAIN_TEXT,
        language_code="en",
    )
    resp = c.analyze_entities(request={"document": document})
    # Convert to JSON-serializable dict.
    return {
        "entities": [
            {
                "name": e.name,
                "type": language_v2.Entity.Type(e.type_).name,
                "salience": e.metadata.get("salience") if e.metadata else None,
                "mentions": [m.text.content for m in e.mentions],
            }
            for e in resp.entities
        ],
        "language_code": resp.language_code,
    }
