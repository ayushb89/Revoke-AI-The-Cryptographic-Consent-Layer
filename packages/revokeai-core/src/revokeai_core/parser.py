"""Split unstructured documents into labelled, hashed data scopes.

The parser is deterministic and rule-based: it finds section headings,
classifies each section against a keyword taxonomy, merges sections that
land in the same scope, and hashes every scope with a per-document salt.
"""

import os
import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from .scopes import SALT_BYTES, DataScope, compute_scope_hash
from .units import join_runs, split_units

UNCLASSIFIED_LABEL = "General Information"


@dataclass(frozen=True)
class ScopeRule:
    label: str
    keywords: tuple[str, ...]
    # Extra terms that signal a *question* is about this scope but are too
    # generic to classify document sections by (e.g. "name", "owe").
    query_hints: tuple[str, ...] = ()


DEFAULT_TAXONOMY: tuple[ScopeRule, ...] = (
    ScopeRule(
        "Patient Identity",
        ("patient", "demographic", "identity", "date of birth", "dob", "mrn", "personal details"),
        ("name", "born", "birthday", "age", "who am i", "record number"),
    ),
    ScopeRule(
        "Lipid Panel",
        ("lipid", "cholesterol", "ldl", "hdl", "triglyceride"),
        ("triglycerides", "heart", "cardiovascular", "fats"),
    ),
    ScopeRule(
        "Virology/HIV Screen",
        ("virology", "hiv", "hepatitis", "viral", "std", "sti screen"),
        ("aids", "virus", "infection", "infectious", "hep c", "hcv", "sti", "stds"),
    ),
    ScopeRule(
        "Metabolic Panel",
        ("metabolic", "glucose", "hba1c", "electrolyte", "creatinine", "kidney"),
        ("sugar", "diabetes", "diabetic", "a1c"),
    ),
    ScopeRule("Medications", ("medication", "prescription", "rx", "dosage"), ("medications", "drug", "drugs", "pill", "pills", "taking")),
    ScopeRule("Diagnosis & Assessment", ("diagnosis", "assessment", "impression", "clinical notes", "plan"), ("diagnosed", "condition")),
    ScopeRule(
        "Billing Details",
        ("billing", "insurance", "invoice", "payment", "claim", "amount due", "policy"),
        ("bill", "owe", "cost", "costs", "pay", "paid", "insurer", "price", "charge", "charged"),
    ),
    ScopeRule("Contact Information", ("contact", "address", "phone", "email", "emergency contact"), ("live", "reach", "call")),
)

_MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(?P<title>.+?)\s*#*\s*$")
_COLON_HEADING = re.compile(r"^\s*(?P<title>[A-Za-z0-9][^:]{0,58}):\s*$")
# ALL-CAPS headings exclude digits so result lines like "HDL 45" are not headings.
_CAPS_HEADING = re.compile(r"^\s*(?P<title>[A-Z][A-Z /&()\-]{2,58})\s*$")


@dataclass(frozen=True)
class Segment:
    """A labelled piece of a document, before salting/hashing."""

    label: str
    content: str
    keywords: tuple[str, ...] = ()


@dataclass(frozen=True)
class ParsedDocument:
    salt: bytes
    scopes: tuple[DataScope, ...]

    @property
    def scope_hashes(self) -> list[bytes]:
        return [s.scope_hash for s in self.scopes]

    @property
    def labels(self) -> list[str]:
        return [s.label for s in self.scopes]

    def by_label(self, label: str) -> DataScope:
        for scope in self.scopes:
            if scope.label == label:
                return scope
        raise KeyError(label)


@dataclass
class DocumentParser:
    taxonomy: Sequence[ScopeRule] = field(default_factory=lambda: DEFAULT_TAXONOMY)

    def parse(self, text: str, salt: bytes | None = None) -> ParsedDocument:
        """Parse `text` into scopes. Pass `salt` only to re-derive hashes of a
        previously parsed document; new documents get a fresh random salt."""
        sections = self._sections(text)
        if not any(heading for heading, _ in sections):
            return self.from_segments(self._sentence_segments(text), salt)
        segments = []
        for heading, body in sections:
            block = f"{heading}\n{body}".strip() if heading else body
            if block:
                segments.append(Segment(self._classify(heading, body), block))
        return self.from_segments(segments, salt)

    def from_segments(self, segments: Sequence[Segment], salt: bytes | None = None) -> ParsedDocument:
        """Merge same-label segments (in first-seen order) and hash each scope."""
        salt = salt if salt is not None else os.urandom(SALT_BYTES)
        blocks: dict[str, list[str]] = {}
        keywords: dict[str, list[str]] = {}
        for seg in segments:
            if not seg.content.strip():
                continue
            blocks.setdefault(seg.label, []).append(seg.content)
            kw = keywords.setdefault(seg.label, [])
            kw.extend(k for k in seg.keywords if k not in kw)
        scopes = []
        for label, parts in blocks.items():
            content = "\n\n".join(parts)
            scopes.append(DataScope(label, content, compute_scope_hash(salt, label, content), tuple(keywords[label])))
        return ParsedDocument(salt=salt, scopes=tuple(scopes))

    def _sentence_segments(self, text: str) -> list[Segment]:
        """Heading-less text: classify each sentence/line on its own so that, for
        example, an HIV result inside a paragraph becomes its own scope.
        Unclassified sentences stay with the preceding topic."""
        units = split_units(text)
        by_label: dict[str, list] = {}
        current = UNCLASSIFIED_LABEL
        for unit in units:
            rule = _best_rule(self.taxonomy, unit.text(text))
            if rule is not None:
                current = rule.label
            by_label.setdefault(current, []).append(unit)
        return [Segment(label, join_runs(text, us)) for label, us in by_label.items()]

    def _sections(self, text: str) -> list[tuple[str, str]]:
        sections: list[tuple[str, list[str]]] = [("", [])]
        for line in text.splitlines():
            heading = _heading_title(line)
            if heading:
                sections.append((heading, []))
            else:
                sections[-1][1].append(line)
        return [(h, "\n".join(lines).strip()) for h, lines in sections if h or "\n".join(lines).strip()]

    def _classify(self, heading: str, body: str) -> str:
        # The heading is the strongest signal; fall back to body keyword density.
        rule = _best_rule(self.taxonomy, heading)
        if rule is None:
            rule = _best_rule(self.taxonomy, body)
        if rule is not None:
            return rule.label
        return heading.strip().title() if heading else UNCLASSIFIED_LABEL


def _heading_title(line: str) -> str | None:
    for pattern in (_MD_HEADING, _COLON_HEADING, _CAPS_HEADING):
        m = pattern.match(line)
        if m:
            return m.group("title").strip()
    return None


def _best_rule(taxonomy: Sequence[ScopeRule], text: str) -> ScopeRule | None:
    haystack = text.lower()
    best, best_hits = None, 0
    for rule in taxonomy:
        hits = sum(len(re.findall(rf"\b{re.escape(k)}\b", haystack)) for k in rule.keywords)
        if hits > best_hits:
            best, best_hits = rule, hits
    return best
