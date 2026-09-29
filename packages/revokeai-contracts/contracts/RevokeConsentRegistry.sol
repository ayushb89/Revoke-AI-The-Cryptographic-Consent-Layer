// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RevokeConsentRegistry
/// @notice On-chain consent ledger for RevokeAI. A user registers the data
///         scopes of a document for an agent session, and can later revoke
///         individual scopes (or end the whole session). Gateways call
///         `checkScopeAccess` before any scope reaches an LLM prompt.
/// @dev    Revocation is one-way: a revoked scope or ended session can never
///         be re-enabled; the user must open a new session instead.
///         Everything stored here is public — scope hashes must be salted
///         off-chain and labels must not contain the sensitive data itself.
contract RevokeConsentRegistry {
    struct Session {
        bytes32 sessionId;
        address userAddress;
        uint256 createdAt;
        bool isActive;
    }

    struct DataScope {
        bytes32 scopeHash;
        string label;
        bool isRevoked;
        uint256 revokedAt;
    }

    uint256 public constant MAX_SCOPES_PER_SESSION = 256;

    mapping(bytes32 => Session) private _sessions;
    mapping(bytes32 => mapping(bytes32 => DataScope)) private _scopes;
    mapping(bytes32 => bytes32[]) private _scopeIndex;

    event SessionInitialized(bytes32 indexed sessionId, address indexed user, uint256 scopeCount);
    event ScopeRevoked(bytes32 indexed sessionId, bytes32 indexed scopeHash, uint256 revokedAt);
    event SessionEnded(bytes32 indexed sessionId, uint256 endedAt);

    error InvalidSessionId();
    error SessionAlreadyExists(bytes32 sessionId);
    error SessionNotFound(bytes32 sessionId);
    error NotSessionOwner(bytes32 sessionId, address caller);
    error SessionNotActive(bytes32 sessionId);
    error EmptyScopes();
    error TooManyScopes(uint256 count);
    error LengthMismatch(uint256 hashes, uint256 labels);
    error InvalidScopeHash();
    error DuplicateScope(bytes32 scopeHash);
    error ScopeNotFound(bytes32 sessionId, bytes32 scopeHash);
    error ScopeAlreadyRevoked(bytes32 sessionId, bytes32 scopeHash);

    modifier onlySessionOwner(bytes32 sessionId) {
        address owner = _sessions[sessionId].userAddress;
        if (owner == address(0)) revert SessionNotFound(sessionId);
        if (owner != msg.sender) revert NotSessionOwner(sessionId, msg.sender);
        _;
    }

    // ------------------------------------------------------------------
    // Writes
    // ------------------------------------------------------------------

    /// @notice Register a new session owned by msg.sender with its document scopes.
    function initSession(bytes32 sessionId, bytes32[] calldata scopeHashes, string[] calldata labels)
        external
    {
        if (sessionId == bytes32(0)) revert InvalidSessionId();
        if (_sessions[sessionId].userAddress != address(0)) revert SessionAlreadyExists(sessionId);
        uint256 count = scopeHashes.length;
        if (count == 0) revert EmptyScopes();
        if (count > MAX_SCOPES_PER_SESSION) revert TooManyScopes(count);
        if (count != labels.length) revert LengthMismatch(count, labels.length);

        _sessions[sessionId] = Session({
            sessionId: sessionId,
            userAddress: msg.sender,
            createdAt: block.timestamp,
            isActive: true
        });

        mapping(bytes32 => DataScope) storage scopes = _scopes[sessionId];
        bytes32[] storage index = _scopeIndex[sessionId];
        for (uint256 i = 0; i < count; ++i) {
            bytes32 h = scopeHashes[i];
            if (h == bytes32(0)) revert InvalidScopeHash();
            if (scopes[h].scopeHash != bytes32(0)) revert DuplicateScope(h);
            scopes[h] = DataScope({scopeHash: h, label: labels[i], isRevoked: false, revokedAt: 0});
            index.push(h);
        }

        emit SessionInitialized(sessionId, msg.sender, count);
    }

    /// @notice Revoke a single scope. Reverts if it is unknown or already revoked.
    function revokeScope(bytes32 sessionId, bytes32 scopeHash) external onlySessionOwner(sessionId) {
        DataScope storage scope = _existingScope(sessionId, scopeHash);
        if (scope.isRevoked) revert ScopeAlreadyRevoked(sessionId, scopeHash);
        _revoke(sessionId, scope);
    }

    /// @notice Revoke many scopes in one transaction. Already-revoked scopes are
    ///         skipped so a retried batch never fails; unknown scopes revert.
    function batchRevokeScopes(bytes32 sessionId, bytes32[] calldata scopeHashes)
        external
        onlySessionOwner(sessionId)
    {
        if (scopeHashes.length == 0) revert EmptyScopes();
        for (uint256 i = 0; i < scopeHashes.length; ++i) {
            DataScope storage scope = _existingScope(sessionId, scopeHashes[i]);
            if (!scope.isRevoked) _revoke(sessionId, scope);
        }
    }

    /// @notice Kill switch: deny access to every scope in the session.
    function endSession(bytes32 sessionId) external onlySessionOwner(sessionId) {
        Session storage s = _sessions[sessionId];
        if (!s.isActive) revert SessionNotActive(sessionId);
        s.isActive = false;
        emit SessionEnded(sessionId, block.timestamp);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice True only if the session is active and the scope exists and is not revoked.
    function checkScopeAccess(bytes32 sessionId, bytes32 scopeHash) public view returns (bool) {
        if (!_sessions[sessionId].isActive) return false;
        DataScope storage scope = _scopes[sessionId][scopeHash];
        return scope.scopeHash != bytes32(0) && !scope.isRevoked;
    }

    /// @notice Batched `checkScopeAccess` so a gateway can evaluate a whole prompt
    ///         context against one consistent block in a single RPC call.
    function checkScopesAccess(bytes32 sessionId, bytes32[] calldata scopeHashes)
        external
        view
        returns (bool[] memory allowed)
    {
        allowed = new bool[](scopeHashes.length);
        for (uint256 i = 0; i < scopeHashes.length; ++i) {
            allowed[i] = checkScopeAccess(sessionId, scopeHashes[i]);
        }
    }

    function getSession(bytes32 sessionId) external view returns (Session memory) {
        return _sessions[sessionId];
    }

    function getScope(bytes32 sessionId, bytes32 scopeHash) external view returns (DataScope memory) {
        return _scopes[sessionId][scopeHash];
    }

    function getSessionScopeHashes(bytes32 sessionId) external view returns (bytes32[] memory) {
        return _scopeIndex[sessionId];
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _existingScope(bytes32 sessionId, bytes32 scopeHash) private view returns (DataScope storage scope) {
        scope = _scopes[sessionId][scopeHash];
        if (scope.scopeHash == bytes32(0)) revert ScopeNotFound(sessionId, scopeHash);
    }

    function _revoke(bytes32 sessionId, DataScope storage scope) private {
        scope.isRevoked = true;
        scope.revokedAt = block.timestamp;
        emit ScopeRevoked(sessionId, scope.scopeHash, block.timestamp);
    }
}
