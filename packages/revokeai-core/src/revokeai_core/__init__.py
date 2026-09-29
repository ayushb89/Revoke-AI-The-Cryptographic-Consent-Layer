"""RevokeAI core: consent-gated context for AI agents."""

from .gatekeeper import (
    AccessOracle,
    AccessSnapshot,
    ContractGatekeeper,
    DenialReason,
    GatekeeperError,
    InMemoryAccessOracle,
    load_registry_abi,
)
from .ingest import SUPPORTED_DESCRIPTION, Extraction, UnsupportedDocument, detect_kind, extract
from .memory_filter import FilterResult, MemoryFilter
from .parser import DEFAULT_TAXONOMY, DocumentParser, ParsedDocument, ScopeRule, Segment
from .relayer import ConsentRelayer, RelayedTx, RelayerError
from .relevance import ScopeRouter
from .receipts import ReceiptSigner, RevocationReceipt, recover_receipt_signer, verify_receipt
from .scopes import DataScope, compute_scope_hash
from .semantic import DocumentAI, GeminiDocumentAI, IngestResult, PlannedScope, ingest_document, segments_from_plan

__version__ = "0.2.0"

__all__ = [
    "AccessOracle",
    "AccessSnapshot",
    "compute_scope_hash",
    "ConsentRelayer",
    "ContractGatekeeper",
    "DataScope",
    "DEFAULT_TAXONOMY",
    "DenialReason",
    "detect_kind",
    "DocumentAI",
    "DocumentParser",
    "extract",
    "Extraction",
    "FilterResult",
    "GatekeeperError",
    "GeminiDocumentAI",
    "ingest_document",
    "IngestResult",
    "InMemoryAccessOracle",
    "load_registry_abi",
    "MemoryFilter",
    "ParsedDocument",
    "PlannedScope",
    "ReceiptSigner",
    "recover_receipt_signer",
    "RelayedTx",
    "RelayerError",
    "RevocationReceipt",
    "ScopeRouter",
    "ScopeRule",
    "Segment",
    "segments_from_plan",
    "SUPPORTED_DESCRIPTION",
    "UnsupportedDocument",
    "verify_receipt",
]
