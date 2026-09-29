"""Decide which data scopes a user's question is about."""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from .parser import DEFAULT_TAXONOMY, ScopeRule
from .scopes import DataScope


@dataclass
class ScopeRouter:
    """Keyword router from a question to the scopes it asks about.

    Returns an empty tuple for general questions ("summarise my report"),
    meaning the caller should fall back to every consented scope.
    """

    taxonomy: Sequence[ScopeRule] = field(default_factory=lambda: DEFAULT_TAXONOMY)

    def relevant(self, question: str, scopes: Sequence[DataScope]) -> tuple[DataScope, ...]:
        text = question.lower()
        rules = {r.label: r for r in self.taxonomy}
        hits = []
        for scope in scopes:
            rule = rules.get(scope.label)
            terms = (*rule.keywords, *rule.query_hints) if rule else ()
            # Chunker-supplied routing keywords (e.g. from semantic chunking).
            terms = (*terms, *(k.lower() for k in scope.keywords))
            # Label words work for scopes outside the taxonomy ("Notes From Visit").
            terms = (*terms, *(w for w in re.findall(r"[a-z]{4,}", scope.label.lower())))
            if any(re.search(rf"\b{re.escape(t)}\b", text) for t in terms):
                hits.append(scope)
        return tuple(hits)
