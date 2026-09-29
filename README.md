# RevokeAI

Consent and memory-hygiene middleware for AI agents, built for the MST Blockchain Buildathon.

**Current stage (Step 5):** a gasless, dual-mode chat app. By default it is a normal Gemini chatbot. **RevokeAI Security** can be switched on to put documents under on-chain consent, backed by the live `RevokeConsentRegistry` on MST Testnet at [`0xAF6816DAB557a6e4258E210D202bc0974D7f9AE1`](https://testnet.mstscan.com/address/0xAF6816DAB557a6e4258E210D202bc0974D7f9AE1). Users never need a wallet and never pay gas: a server-side relayer signs every consent transaction.

```
.
├── backend/                         FastAPI gateway
│   └── app/
│       ├── main.py                  create_app(); /api/health, /api/chat
│       ├── gemini_client.py         google-genai wrapper (per-turn consented context)
│       └── extensions/
│           ├── __init__.py          ExtensibleApp.use_extension(), ChatContext, ChatBlocked
│           └── revokeai.py          RevokeAIExtension: documents, relayer, chat gatekeeping
├── frontend/                        React demo UI (dual mode, no wallet)
├── packages/
│   ├── revokeai-core/               standalone Python SDK (ingestion, semantic chunking, gatekeeper, filter, receipts, relayer)
│   └── revokeai-contracts/          Solidity registry + Hardhat deployment
└── scripts/
    ├── test_revoke_flow.py          end-to-end verification
    └── fixtures/mock_medical_report.md
```

**Deploying:** see [DEPLOY.md](DEPLOY.md) (Render backend + Vercel frontend).

## Document ingestion

`POST /api/documents/upload` accepts **.txt, .md, .pdf, .docx, .png, .jpg** (up to 10 MB). The type is checked from the file's bytes, not its extension.

1. **Extract text.** PDFs are read through their text layer (PyMuPDF) and Word files with python-docx, with tables kept in reading order. Images and scanned PDFs are transcribed by Gemini's vision model.
2. **Semantic chunking.** The text is split into numbered sentences and lines. Gemini, acting as the *Data Privacy Parser*, returns only `{label, units, keywords}` as schema-constrained JSON. The server cuts each scope's content out of the source by offset, so **every hashed byte is verbatim source text**; the model never retypes it. Bad plans are repaired: unknown or duplicate units are ignored and gaps join the previous scope. Labels are stripped of digits because they are published on-chain.
3. **Hash and register.** Scopes go through the same salted keccak hashing and relayer `initSession` as before.

If Gemini is unavailable (quota, network or bad output), ingestion falls back to the rule-based parser. That parser splits heading-less text sentence by sentence, and the review modal shows which method was used. Each upload costs **1 Gemini request** for text, PDF and Word files, or **2** for images and scans. Set `REVOKEAI_SEMANTIC_CHUNKING=false` to use rules only.

## How a request is gated

1. `POST /api/documents/upload` (multipart `file`). The server extracts the text and chunks it into scopes (see *Document ingestion*) and keeps the chunks in memory only. It returns `sessionId` and a secret `sessionToken`.
2. `POST /api/relayer/initSession` `{sessionId}`. The relayer wallet registers the scopes on MST and pays the gas, then returns `{txHash, blockNumber, explorerUrl}`.
3. `POST /api/chat` with `sessionId` and the `X-RevokeAI-Session-Token` header. Before anything reaches Gemini, every scope is checked on-chain at a single block:
   - If the question targets a revoked scope, the server returns **403** `{"status": "blocked", "message": "Access Denied: Permission for Virology/HIV Screen was permanently revoked on MST Blockchain.", ...}` with a signed receipt, and Gemini is never called.
   - Otherwise only consented scopes that are relevant to the question are sent as context. Earlier answers grounded in data that has since been revoked are removed from `history`.
4. `POST /api/relayer/revokeScope` `{sessionId, scopeHashes}`. The relayer calls `revokeScope` for a single scope or `batchRevokeScopes` for several, and the content is purged from server memory as soon as the transaction confirms. `POST /api/relayer/endSession` revokes everything.

### Security model of the relayer

- **Custodial consent.** The relayer is the on-chain owner of every session, so consent is custodial (the platform operator holds it), as in typical B2B infrastructure. The gatekeeper only honours sessions owned by the gateway's relayer.
- **Access requires the session token.** Every relayer write and every chat call needs the session token issued at upload. The `sessionId` is public on-chain and never grants access on its own.
- **Spend protection.** Uploads and relayer writes are rate-limited per client. `/api/health` reports the relayer's address and balance, and the UI warns when the balance is low.
- **Idempotent writes.** Repeated `initSession`/`revokeScope`/`endSession` calls, such as double-clicks, return the original transaction instead of paying twice.
- **Fail closed.** If the registry can't be reached, requests fail with `503`. MST requires a priority fee of at least 1 gwei, and the relayer always pays at least that.

## Verify the pipeline

```powershell
cd backend; pip install -r requirements-dev.txt; cd ..
backend/.venv/Scripts/python scripts/test_revoke_flow.py               # in-process EVM + real Gemini
backend/.venv/Scripts/python scripts/test_revoke_flow.py --stub-llm    # fully offline
backend/.venv/Scripts/python scripts/test_revoke_flow.py --chain mst   # live MST via the relayer key in backend/.env (2 txs)
```

## Setup (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt   # includes ../packages/revokeai-core (editable)
Copy-Item .env.example .env
notepad .env        # set GEMINI_API_KEY="..."
uvicorn app.main:app --reload --port 8000
```

## Setup (macOS / Linux / Git Bash)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env             # then edit .env and set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

## API

| Method | Path          | Purpose                                                        |
|--------|---------------|----------------------------------------------------------------|
| GET    | `/api/health` | `gemini_configured: true/false` (never the key itself) and extension info |
| POST   | `/api/chat`   | `{ message, history[], sessionId? }` → `{ reply, model, history[], extensions? }` |
| POST   | `/api/documents/upload` | multipart `file` (.txt/.md, ≤1 MB) + `userAddress` → scopes, session token, unsigned `initSession` tx |
| GET    | `/api/documents/{sessionId}` | on-chain status of each scope: `allowed`, `reason`, `purgedFromMemory` |
| POST   | `/api/documents/{sessionId}/revoke` | `{scopeHashes[]}` → unsigned `batchRevokeScopes` tx |
| POST   | `/api/documents/{sessionId}/end` | unsigned `endSession` tx (revokes every scope) |

The server is stateless: the client sends the returned `history` back with the next message.
`history` items are `{ "role": "user" | "model", "content": "..." }`.

Error codes from `/api/chat`: `422` bad input; `401`/`404` bad session token or unknown session; `403` blocked by consent; `503` key not configured or registry unreachable; `429` upstream rate limit; `502` upstream error. Upstream error details are logged on the server only and never sent to the client.

## Testing

```bash
curl http://localhost:8000/api/health

curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "My name is Ada. Say hi in 5 words.", "history": []}'

curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my name?", "history": [
        {"role": "user",  "content": "My name is Ada. Say hi in 5 words."},
        {"role": "model", "content": "Hi Ada, nice to meet!"}]}'
```

In PowerShell, use `curl.exe` (not the `curl` alias) and single-quote the JSON body:

```powershell
curl.exe -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{\"message\": \"Hello!\", \"history\": []}'
```

Or `Invoke-RestMethod`:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/chat -ContentType 'application/json' `
  -Body (@{ message = 'Hello!'; history = @() } | ConvertTo-Json)
```

Interactive docs: http://localhost:8000/docs

## Secret handling

- `GEMINI_API_KEY` is read only through `os.getenv`. `backend/.env` is loaded into the environment for local development, and a variable already set in the shell takes precedence.
- `.env`, `.env.*`, keys, keystores and credentials are git-ignored. Only `.env.example` is tracked.
- Before committing, confirm the key is ignored: `git check-ignore -v backend/.env` should print a match.
