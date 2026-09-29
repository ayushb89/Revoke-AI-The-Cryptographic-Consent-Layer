import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, toHex } from "viem";

describe("RevokeConsentRegistry", async () => {
  const { viem } = await network.create();
  const [, stranger] = await viem.getWalletClients();

  const scopes = ["Patient Identity", "Lipid Panel", "Virology/HIV Screen"].map((label) => ({
    label,
    hash: keccak256(toHex(`salted:${label}`)),
  }));
  const hashes = scopes.map((s) => s.hash);
  const labels = scopes.map((s) => s.label);

  async function withSession() {
    const registry = await viem.deployContract("RevokeConsentRegistry");
    const sessionId = keccak256(toHex(`session-${Math.random()}`));
    await registry.write.initSession([sessionId, hashes, labels]);
    return { registry, sessionId };
  }

  it("grants access to registered scopes of an active session", async () => {
    const { registry, sessionId } = await withSession();
    assert.deepEqual(await registry.read.checkScopesAccess([sessionId, hashes]), [true, true, true]);
  });

  it("revokeScope denies exactly that scope", async () => {
    const { registry, sessionId } = await withSession();
    await viem.assertions.emit(registry.write.revokeScope([sessionId, hashes[2]]), registry, "ScopeRevoked");
    assert.deepEqual(await registry.read.checkScopesAccess([sessionId, hashes]), [true, true, false]);
    const scope = await registry.read.getScope([sessionId, hashes[2]]);
    assert.equal(scope.isRevoked, true);
    assert.ok(scope.revokedAt > 0n);
  });

  it("batchRevokeScopes revokes many in one tx and tolerates repeats", async () => {
    const { registry, sessionId } = await withSession();
    await registry.write.revokeScope([sessionId, hashes[0]]);
    await registry.write.batchRevokeScopes([sessionId, hashes]);
    assert.deepEqual(await registry.read.checkScopesAccess([sessionId, hashes]), [false, false, false]);
  });

  it("endSession denies every scope", async () => {
    const { registry, sessionId } = await withSession();
    await registry.write.endSession([sessionId]);
    assert.equal(await registry.read.checkScopeAccess([sessionId, hashes[0]]), false);
  });

  it("only the session owner can revoke", async () => {
    const { registry, sessionId } = await withSession();
    await viem.assertions.revertWithCustomError(
      registry.write.revokeScope([sessionId, hashes[0]], { account: stranger.account }),
      registry,
      "NotSessionOwner",
    );
  });

  it("rejects duplicate sessions and unknown scopes", async () => {
    const { registry, sessionId } = await withSession();
    await viem.assertions.revertWithCustomError(
      registry.write.initSession([sessionId, hashes, labels], { account: stranger.account }),
      registry,
      "SessionAlreadyExists",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.revokeScope([sessionId, keccak256(toHex("unknown"))]),
      registry,
      "ScopeNotFound",
    );
    assert.equal(await registry.read.checkScopeAccess([sessionId, keccak256(toHex("unknown"))]), false);
  });
});
