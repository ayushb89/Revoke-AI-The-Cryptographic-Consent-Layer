# RevokeAI demo UI

React 19 + TypeScript + Tailwind 4 + Lucide. No wallet is needed: the UI talks only to the FastAPI gateway, whose relayer signs and pays for every on-chain consent write. `ethers` is used only for read-only verification of rejection receipts in the browser, with no browser provider and no `window.ethereum`.

## Run

```powershell
# Terminal 1: gateway (needs REVOKEAI_RELAYER_PRIVATE_KEY or MST_USER_PRIVATE_KEY in backend/.env)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 2: UI
cd frontend
npm install
npm run dev          # http://localhost:5173
```

## Demo script

1. **Default mode.** The app is a normal AI assistant. Ask it anything; there's no document handling and no blockchain involved.
2. Flip **Enable RevokeAI Security** in the header. The upload area and the *Active Agent Data Scopes* checklist appear. Each mode keeps its own conversation.
3. **Load sample lab report.** Review the four scopes, then click **Secure 4 scopes & start**. The button shows *Securing on-chain…* while the relayer registers consent. The chat then confirms that the document is secured, with a *View proof* link.
4. **Ask "What was my HIV screen result?"** The agent answers from the Virology scope only, and the checklist flags it as *used in last answer*.
5. **Revoke Access** on *Virology/HIV Screen*. The badge shows *SECURING ON-CHAIN…* and then *REVOKED* with a *View proof* link to the MST transaction and *Purged from agent memory*. The earlier HIV answer is scrubbed.
6. **Ask again.** A red shield card appears and Gemini is never called. The browser verifies the gateway's EIP-712 signature and reads `isRevoked = true` directly from the contract.
7. Optionally, tick several scopes and click **Revoke selected** (one transaction), or **End session**.

## Notes

- The session token lives in memory only, so reloading the page starts a new secure session. The chosen mode is remembered in `localStorage`.
- Chain details (RPC, explorer and registry) come from the gateway's `/api/health`. The frontend has no chain configuration.
