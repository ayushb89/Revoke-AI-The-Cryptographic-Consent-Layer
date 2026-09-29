"""Runtime configuration, read strictly from environment variables.

A local `backend/.env` file (git-ignored) is loaded into the process
environment for development convenience; real deployments should inject
variables directly. Secrets (API key, signer key) are never logged,
returned, or stored anywhere other than this process's memory.
"""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# backend/.env — does not override variables already set in the shell.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

MST_TESTNET_RPC_URL = "https://testnetrpc.mstblockchain.com"
MST_TESTNET_EXPLORER_URL = "https://testnet.mstscan.com"
MST_TESTNET_CHAIN_ID = 91562037
# RevokeConsentRegistry deployed to MST Testnet at block 5786174.
MST_REGISTRY_ADDRESS = "0xAF6816DAB557a6e4258E210D202bc0974D7f9AE1"


@dataclass(frozen=True)
class Settings:
    gemini_model: str
    allowed_origins: list[str]
    # Optional regex for extra browser origins, e.g. Vercel preview deployments.
    allowed_origin_regex: str | None
    revokeai_enabled: bool
    revokeai_rpc_url: str
    revokeai_registry_address: str
    revokeai_explorer_url: str
    revokeai_session_ttl_seconds: int
    revokeai_semantic_chunking: bool
    revokeai_doc_model: str

    @property
    def gemini_api_key(self) -> str | None:
        return _secret("GEMINI_API_KEY")

    @property
    def gemini_configured(self) -> bool:
        return self.gemini_api_key is not None

    @property
    def revokeai_signer_key(self) -> str | None:
        return _secret("REVOKEAI_SIGNER_KEY")

    @property
    def revokeai_relayer_key(self) -> str | None:
        """Key of the gas-paying relayer wallet (testnet-only, never a user key)."""
        return _secret("REVOKEAI_RELAYER_PRIVATE_KEY") or _secret("MST_USER_PRIVATE_KEY")


def _secret(name: str) -> str | None:
    # Tolerate values pasted into hosting dashboards with surrounding quotes/spaces.
    value = (os.getenv(name) or "").strip().strip('"').strip("'").strip()
    return value or None


def _load() -> Settings:
    origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    return Settings(
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip(),
        # Exact origins, comma-separated, no trailing slash (e.g. https://revoke-ai.vercel.app).
        allowed_origins=[o.strip().rstrip("/") for o in origins.split(",") if o.strip()],
        allowed_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or None,
        revokeai_enabled=os.getenv("REVOKEAI_ENABLED", "true").strip().lower() in ("1", "true", "yes"),
        revokeai_rpc_url=os.getenv("REVOKEAI_RPC_URL", MST_TESTNET_RPC_URL).strip(),
        revokeai_registry_address=os.getenv("REVOKEAI_REGISTRY_ADDRESS", MST_REGISTRY_ADDRESS).strip(),
        revokeai_explorer_url=os.getenv("REVOKEAI_EXPLORER_URL", MST_TESTNET_EXPLORER_URL).strip().rstrip("/"),
        revokeai_session_ttl_seconds=int(os.getenv("REVOKEAI_SESSION_TTL_SECONDS", "7200")),
        # Gemini-powered document reading (vision OCR + semantic chunking); rules are the fallback.
        revokeai_semantic_chunking=os.getenv("REVOKEAI_SEMANTIC_CHUNKING", "true").strip().lower() in ("1", "true", "yes"),
        revokeai_doc_model=os.getenv("REVOKEAI_DOC_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.8-flash")).strip(),
    )


settings = _load()
