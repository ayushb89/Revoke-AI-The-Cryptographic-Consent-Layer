# Deploying RevokeAI

| Part | Host | Config |
|---|---|---|
| Backend (FastAPI + `revokeai-core` SDK + gas relayer) | Render, free web service | [`render.yaml`](render.yaml) |
| Frontend (Vite + React) | Vercel | [`frontend/vercel.json`](frontend/vercel.json) |
| Contract `RevokeConsentRegistry` | Already live on MST Testnet at `0xAF6816DAB557a6e4258E210D202bc0974D7f9AE1` | Not redeployed |

Deploy the backend first, because the frontend needs its URL, then come back to set CORS on the backend.

## 1. Backend on Render

1. Push the repository, including `render.yaml`, to GitHub.
2. In Render: **New → Blueprint** → connect GitHub → select `ayushb89/Revoke-AI` → **Apply**.
3. Render asks for the values marked `sync: false`. Paste them there, and only there:

| Variable | Value | Secret? |
|---|---|---|
| `GEMINI_API_KEY` | From https://aistudio.google.com/apikey. Enable billing for demo day; the free tier allows 20 requests/day. | yes |
| `REVOKEAI_RELAYER_PRIVATE_KEY` | A **new, testnet-only** wallet key funded from https://faucet.mstblockchain.com. It pays gas for every consent write. | yes |
| `REVOKEAI_SIGNER_KEY` | Signs revocation receipts and holds no funds. Keep it stable, or old receipts stop verifying. | yes |
| `ALLOWED_ORIGINS` | For now `http://localhost:5173`. After step 2, your Vercel URL, e.g. `https://revoke-ai.vercel.app` (no trailing slash). | no |

   Generate the two keys locally (they are printed only in your terminal):

   ```powershell
   backend\.venv\Scripts\python.exe -c "from eth_account import Account; a=Account.create(); print('relayer', a.address, a.key.hex())"
   backend\.venv\Scripts\python.exe -c "from eth_account import Account; print('signer', Account.create().key.hex())"
   ```

   Then send about 1 tMSTC from the faucet to the relayer address.

   The remaining variables (`REVOKEAI_REGISTRY_ADDRESS`, `REVOKEAI_RPC_URL`, `REVOKEAI_EXPLORER_URL`, `GEMINI_MODEL`, `REVOKEAI_SEMANTIC_CHUNKING`, `REVOKEAI_SESSION_TTL_SECONDS`, `PYTHON_VERSION`) are already set in `render.yaml`. The contract address variable is `REVOKEAI_REGISTRY_ADDRESS`; there is no `CONTRACT_ADDRESS`.

4. Wait for the deploy. Then open `https://<service>.onrender.com/api/health`. You should see `"gemini_configured": true`, `"chainId": 91562037` and `"relayer": {"configured": true, ...}`, with no private keys anywhere.

**How the build works:** Render runs `cd backend && pip install -r requirements.txt`. That file contains `-e ../packages/revokeai-core`, so the SDK is installed from the repository before Uvicorn starts. Uvicorn runs a **single worker**, because document sessions and the relayer's nonce lock live in process memory.

## 2. Frontend on Vercel

1. In Vercel: **Add New → Project** → import `ayushb89/Revoke-AI`.
2. Set **Root Directory** to `frontend`. The framework (Vite), build command and output directory come from `vercel.json`.
3. Under **Environment Variables**, add `VITE_API_BASE` = `https://<service>.onrender.com` (no trailing slash) for Production, and for Preview if you want.
4. Click **Deploy** and note the URL, e.g. `https://revoke-ai.vercel.app`.

`VITE_API_BASE` is compiled into the JavaScript bundle at build time. If you change it, trigger a redeploy. It must never hold a secret, and it doesn't: the frontend only needs the public backend URL.

## 3. Connect them (CORS)

In the Render dashboard, open **revokeai-backend → Environment**:

- Set `ALLOWED_ORIGINS` = `https://revoke-ai.vercel.app`. Separate several origins with commas.
- Optionally, to also allow Vercel preview deployments, set `ALLOWED_ORIGIN_REGEX` = `https://revoke-ai-[a-z0-9-]+\.vercel\.app`.
- Save. Render redeploys automatically.

## 4. Smoke test

1. Open the Vercel URL, sign up and sign in.
2. Plain chat: ask a question and get an answer.
3. Turn on RevokeAI Security, load the sample, then secure it. The *View proof* link should open an MST transaction.
4. Revoke *Virology/HIV Screen*, ask about HIV, and get the red blocked card with all checks passing.

## Security model

- **Keys stay on Render.** The relayer and signer keys exist only as Render environment variables. They are never committed (`.env` is git-ignored), never sent to the browser, and never returned by any endpoint; `/api/health` exposes only the relayer's public address and balance.
- **The frontend has no secrets.** It holds no wallet and no keys. It verifies receipts with public data only: the gateway's EIP-712 signer address and the public MST RPC.
- **Relayer writes need a session token.** Every relayer write requires the per-session token issued at upload. Writes are rate-limited per client IP (Uvicorn runs with `--proxy-headers`), and the relayer's balance caps total spend.

## Free-tier caveats

- **Cold starts.** Render's free tier sleeps after 15 minutes idle, and the next request takes about 30–60 s. Open `/api/health` a minute before a demo to wake it.
- **Uploads don't survive restarts.** Uploaded documents live in memory, so a restart or sleep clears them and users must re-upload. The on-chain consent records are permanent.
- **Gemini quota.** On the free tier, each chat message costs 1 request, text/PDF/Word uploads cost 1 and image uploads cost 2.
