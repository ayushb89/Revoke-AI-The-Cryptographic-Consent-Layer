# RevokeAI: 5-Minute Demo Video Script

**Team 51 · MST Blockchain Buildathon**

Total runtime is 5:00, spoken at about 140 words per minute. The **SCREEN** line under each section says what to show while you speak.

---

## 0:00 – 0:30 · Hook and introduction

**SCREEN:** Landing page, hero section (the violet fibre fan). Move the mouse slowly.

> "Hi, we're Team 51, and this is RevokeAI.
> Every day, people hand AI agents their medical records, contracts and tax files. The agent reads everything and keeps it: in its context, its vector store, its logs. Long after the task is done.
> There is no undo button for what an AI has seen. RevokeAI is that undo button."

---

## 0:30 – 1:05 · The problem

**SCREEN:** Scroll to the **"AI Never Forgets. That Is the Breach."** section (tangled fibres becoming one beam).

> "Today, consent for AI is all or nothing. You share a twenty-page medical report to ask one question about cholesterol, and the agent now also holds your HIV result, your insurance number and your identity. Forever.
> For healthcare, finance and legal platforms, that is a breach waiting to happen, and a compliance nightmare. Users need granular consent, and they need proof that revocation actually happened."

---

## 1:05 – 1:40 · Our solution

**SCREEN:** Scroll to **"Consent You Can Revoke. Proof You Can Verify."** (the X crossing), then to the product preview rising.

> "RevokeAI is a consent layer that sits between your data and any AI agent. Think Auth0 plus Stripe, for data sovereignty.
> It does three things. It splits a document into labelled data scopes. It records consent for each scope on the MST blockchain. And a gatekeeper checks that on-chain consent before every single prompt reaches the model.
> Revoke a scope, and the agent is cut off instantly, with a signed receipt as proof."

---

## 1:40 – 2:00 · Seamless, no crypto friction

**SCREEN:** Click **Try RevokeAI**, sign in (have an account ready), and land in the chat. Toggle **Enable RevokeAI Security**.

> "No wallet, no gas fees, nothing to install. Our backend relayer signs and pays for every transaction invisibly, so it feels like a normal chatbot. By default it *is* a normal AI assistant. One toggle turns on RevokeAI Security."

---

## 2:00 – 2:40 · Live demo: ingestion and consent

**SCREEN:** Click **Load sample lab report**. Pause on the **review modal**: point at the four scopes, the *Highly sensitive* tag and the *AI semantic chunking* badge. Click **Secure 4 scopes & start** and show the *"secured… View proof"* message.

> "We upload a lab report. Gemini reads it (PDFs, Word files, even photos) and splits it into scopes: Patient Identity, Lipid Panel, Virology and HIV, Billing.
> Only salted fingerprints of these go on-chain, never the data itself.
> One click, and consent for all four scopes is registered on MST Testnet. Here is the transaction proof on the explorer."

*(Optional: quickly open the View proof link in MSTScan, then come back.)*

---

## 2:40 – 3:15 · Live demo: granted access

**SCREEN:** Ask **"What was my HIV screen result?"** Show the answer, then click **AI reasoning** to open the console. Point at the right-hand **Active Agent Data Scopes** checklist with *"used in last answer"*.

> "Now I ask the agent about my HIV screen. Consent is checked on-chain first, and only the Virology scope is sent to the model. Nothing else.
> Open the AI reasoning log: the gateway shows exactly which scope was sent, at which block, and the model explains how it answered.
> On the right is our memory checklist. It tells me what the agent just used."

---

## 3:15 – 4:05 · Live demo: the revoke moment (core)

**SCREEN:** Click **Revoke Access** on *Virology/HIV Screen*. Show **SECURING ON-CHAIN… → REVOKED**, *View proof* and *Purged from agent memory*. Point at the earlier answer, now **"Scrubbed from agent memory"**. Then ask the HIV question again: the **red Access Denied card**. Open its **AI reasoning** log.

> "The task is done, so I revoke the HIV scope. That's a real transaction on MST, and it's REVOKED, with proof.
> Three things just happened. The data is purged from the server's memory. The earlier answer is scrubbed from the conversation. And the chain now says no.
> Watch: I ask again. Blocked. The gatekeeper intercepted the query before it ever reached Gemini. The browser independently verifies the signed receipt and reads isRevoked equals true directly from the contract.
> And other scopes still work: ask about cholesterol and it answers, with HIV withheld."

*(If time allows, ask "Is my LDL cholesterol healthy?" to show HIV struck through as withheld.)*

---

## 4:05 – 4:35 · Architecture and tech

**SCREEN:** GitHub repo README, or the landing page **Architecture** docs panel.

> "Under the hood: a Solidity consent registry on MST Testnet, a FastAPI gateway with our standalone Python SDK, revokeai-core, Gemini for vision, semantic chunking and chat, and a React frontend.
> The middleware fails closed: if consent can't be verified, no data flows. Every denial carries an EIP-712 signed receipt. And the SDK is pluggable into any agent platform."

---

## 4:35 – 5:00 · Impact and close

**SCREEN:** Landing page closing section, **"Take Back What Your Agents Know."**

> "RevokeAI turns consent from a one-time checkbox into a live, revocable, verifiable right, for healthcare AI, financial assistants and legal bots.
> AI should be able to learn from your data. It should never be able to keep it without you.
> We're Team 51. Thank you."

---

## Recording checklist

- [ ] Wake the Render backend by opening `/api/health` two minutes before recording (the free tier sleeps).
- [ ] Sign in beforehand, or keep the credentials ready.
- [ ] Start from a fresh session: refresh the page so there's no earlier chat.
- [ ] Check Gemini quota: the demo uses about 4–5 requests.
- [ ] Zoom the browser to 110–125% so text is readable in the video.
- [ ] Do one dry run. Revocation takes about 3–5 seconds on MST, so keep talking while it confirms.
