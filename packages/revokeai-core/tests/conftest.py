import os
from pathlib import Path

import pytest
from eth_account import Account

from revokeai_core import DocumentParser, ReceiptSigner

CONTRACT_PATH = (
    Path(__file__).resolve().parents[2] / "revokeai-contracts" / "contracts" / "RevokeConsentRegistry.sol"
)
SOLC_VERSION = "0.8.28"

SAMPLE_MEDICAL_RECORD = """\
# Patient Details
Name: Jane Q. Doe
Date of Birth: 1987-04-12
MRN: 00482913

LIPID PANEL
Total Cholesterol: 242 mg/dL (H)
LDL-C: 161 mg/dL (H)
HDL-C: 38 mg/dL (L)
Triglycerides: 215 mg/dL (H)

Virology:
HIV-1/2 Ag/Ab Combo: Non-reactive
Hepatitis C Ab: Non-reactive

## Billing & Insurance
Insurer: Acme Health PPO, Policy #AH-55-1029
Amount Due: $184.20
"""


@pytest.fixture
def sample_record() -> str:
    return SAMPLE_MEDICAL_RECORD


@pytest.fixture
def parsed(sample_record):
    return DocumentParser().parse(sample_record)


@pytest.fixture
def session_id() -> bytes:
    return os.urandom(32)


@pytest.fixture
def signer() -> ReceiptSigner:
    # Ephemeral key per test run; real deployments load REVOKEAI_SIGNER_KEY.
    return ReceiptSigner(Account.create().key)


@pytest.fixture(scope="session")
def compiled_registry() -> dict:
    solcx = pytest.importorskip("solcx")
    try:
        solcx.install_solc(SOLC_VERSION)
    except Exception as exc:  # offline machines
        pytest.skip(f"solc {SOLC_VERSION} unavailable: {exc}")
    out = solcx.compile_files(
        [str(CONTRACT_PATH)], output_values=["abi", "bin"], solc_version=SOLC_VERSION, optimize=True, evm_version="cancun"
    )
    (_, artifact), = out.items()
    return artifact
