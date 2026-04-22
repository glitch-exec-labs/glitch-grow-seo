"""
Google auth — service-account credentials + scoped token helpers.

Every downstream client either:
  - uses `build_service(api, version)` for SDK-based APIs, or
  - fetches a bearer via `bearer_token(scope)` and calls httpx directly.
"""
from __future__ import annotations

from functools import lru_cache

from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import Resource, build

from ..config import settings

# Keep scopes centralized so each API client asks for exactly what it needs.
SCOPES = {
    "search_console": ["https://www.googleapis.com/auth/webmasters.readonly"],
    "search_console_rw": ["https://www.googleapis.com/auth/webmasters"],
    "indexing": ["https://www.googleapis.com/auth/indexing"],
    "language": ["https://www.googleapis.com/auth/cloud-platform"],
    "custom_search": ["https://www.googleapis.com/auth/cse"],
    # PageSpeed Insights: no scope needed for public URLs; an API key
    # path is simpler but a signed SA token also works.
}


@lru_cache(maxsize=8)
def credentials(scope_key: str) -> service_account.Credentials:
    """SA credentials scoped to a single API family. Cached per scope."""
    path = settings().google_sa_path
    if not path.exists():
        raise FileNotFoundError(
            f"Service-account key not found at {path}. Run the install step "
            f"in agent/README.md."
        )
    scopes = SCOPES.get(scope_key)
    if not scopes:
        raise ValueError(f"Unknown scope_key={scope_key!r}. Known: {sorted(SCOPES)}")
    return service_account.Credentials.from_service_account_file(str(path), scopes=scopes)


def bearer_token(scope_key: str) -> str:
    """Force-refresh and return an Authorization header value."""
    creds = credentials(scope_key)
    if not creds.valid:
        creds.refresh(Request())
    return f"Bearer {creds.token}"


def service_account_email() -> str:
    """Useful for IAM-error messages: 'add <this-email> to your property'."""
    creds = credentials("search_console")
    return creds.service_account_email  # type: ignore[no-any-return]


def build_service(api: str, version: str, scope_key: str) -> Resource:
    """Discovery-based client — used for APIs whose pagination or
    method surface is easier via the official SDK than raw HTTP."""
    return build(api, version, credentials=credentials(scope_key), cache_discovery=False)
