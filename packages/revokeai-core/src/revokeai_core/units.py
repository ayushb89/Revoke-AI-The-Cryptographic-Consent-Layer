"""Split text into small, exactly-addressable units (lines, then sentences).

Units are the atoms that chunkers group into scopes. Every unit records its
character offsets in the source, so scope content can always be cut verbatim
from the original text: no chunker ever retypes the document.
"""

import re
from dataclasses import dataclass

# Lines longer than this are split into sentences.
_SPLIT_LINES_OVER = 120
_SENTENCE_END = re.compile(r"[.!?;](?=\s+[\"'(\[]?[A-Z0-9])")
_ABBREVIATIONS = {"dr", "mr", "mrs", "ms", "st", "no", "vs", "jr", "sr", "inc", "ltd", "co", "e.g", "i.e", "approx", "dept"}


@dataclass(frozen=True)
class TextUnit:
    index: int
    start: int
    end: int

    def text(self, source: str) -> str:
        return source[self.start : self.end]


def split_units(text: str) -> list[TextUnit]:
    units: list[TextUnit] = []
    pos = 0
    for line in text.splitlines(keepends=True):
        body = line.rstrip("\r\n")
        for start, end in _sentence_spans(body) if len(body.strip()) > _SPLIT_LINES_OVER or _has_multiple_sentences(body) else [(0, len(body))]:
            seg = body[start:end]
            lead = len(seg) - len(seg.lstrip())
            trail = len(seg.rstrip())
            if trail > lead:
                units.append(TextUnit(len(units), pos + start + lead, pos + start + trail))
        pos += len(line)
    return units


def join_runs(text: str, units: list[TextUnit]) -> str:
    """Verbatim content for a set of units: each run of consecutive units is one
    exact slice of the source; separate runs are joined by a newline."""
    ordered = sorted(units, key=lambda u: u.index)
    runs: list[tuple[int, int]] = []
    prev = None
    for u in ordered:
        if prev is not None and u.index == prev.index + 1:
            runs[-1] = (runs[-1][0], u.end)
        else:
            runs.append((u.start, u.end))
        prev = u
    return "\n".join(text[a:b] for a, b in runs)


def _has_multiple_sentences(line: str) -> bool:
    return len(_sentence_spans(line)) > 1


def _sentence_spans(line: str) -> list[tuple[int, int]]:
    spans, start = [], 0
    for m in _SENTENCE_END.finditer(line):
        word = re.search(r"([A-Za-z.]+)$", line[start : m.start()])
        prev = (word.group(1) if word else "").lower().rstrip(".")
        if prev in _ABBREVIATIONS or len(prev) == 1:  # "Dr. Rahman", "A. Rahman"
            continue
        spans.append((start, m.end()))
        start = m.end()
    spans.append((start, len(line)))
    return [(a, b) for a, b in spans if line[a:b].strip()]
