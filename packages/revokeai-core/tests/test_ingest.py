"""File ingestion + semantic chunking, fully offline (fake DocumentAI)."""

import asyncio
import io

import pytest

from revokeai_core import (
    DocumentParser,
    PlannedScope,
    ScopeRouter,
    UnsupportedDocument,
    compute_scope_hash,
    detect_kind,
    extract,
    ingest_document,
    segments_from_plan,
)
from revokeai_core.units import split_units

pymupdf = pytest.importorskip("pymupdf")
docx = pytest.importorskip("docx")

UNSTRUCTURED = (
    "Rahul Mehta visited on Monday, 12 March. His total cholesterol was 250 mg/dL and LDL was 170. "
    "His HIV-1/2 antibody test was non-reactive. He has been prescribed atorvastatin 20mg daily. "
    "The visit was billed to Star Health and he owes Rs 2,000."
)


# ---------------------------------------------------------------------------
# fixtures: real files built in memory
# ---------------------------------------------------------------------------


def make_pdf(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_textbox(pymupdf.Rect(40, 40, 560, 800), text, fontsize=10)
    return doc.tobytes()


def make_png() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=300, height=100)
    page.insert_text((10, 50), "HIV screen: Non-reactive", fontsize=14)
    return page.get_pixmap().tobytes("png")


def make_scanned_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_image(pymupdf.Rect(0, 0, 300, 100), stream=make_png())
    return doc.tobytes()


def make_docx() -> bytes:
    d = docx.Document()
    d.add_heading("Employment Agreement", level=1)
    d.add_paragraph("This agreement is between Acme Corp and Priya Sharma.")
    d.add_heading("Compensation", level=2)
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "Base salary", "Rs 18,00,000"
    t.cell(1, 0).text, t.cell(1, 1).text = "Bonus", "10%"
    d.add_heading("Termination", level=2)
    d.add_paragraph("Either party may terminate with 60 days notice.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


class FakeAI:
    """Deterministic stand-in for Gemini: labels units by keyword."""

    def __init__(self, fail: Exception | None = None, transcript: str = "HIV screen: Non-reactive") -> None:
        self.fail, self.transcript, self.calls = fail, transcript, []

    async def transcribe(self, data, mime_type):
        self.calls.append(("transcribe", mime_type))
        if self.fail:
            raise self.fail
        return self.transcript

    async def plan(self, numbered, standard_labels):
        self.calls.append(("plan", numbered))
        if self.fail:
            raise self.fail
        buckets: dict[str, list[int]] = {}
        for line in numbered.splitlines():
            n, text = int(line[1 : line.index("]")]), line.lower()
            label = (
                "Virology/HIV Screen" if "hiv" in text
                else "Lipid Panel" if "cholesterol" in text or "ldl" in text
                else "Medications" if "prescribed" in text
                else "Billing Details" if "billed" in text or "owe" in text
                else "Patient Identity"
            )
            buckets.setdefault(label, []).append(n)
        return [PlannedScope(label, units, [label.split()[0].lower()]) for label, units in buckets.items()]


# ---------------------------------------------------------------------------
# detection + extraction
# ---------------------------------------------------------------------------


def test_detects_types_by_content_not_extension():
    assert detect_kind("report.pdf", make_pdf("x")) == "pdf"
    assert detect_kind("renamed.txt", make_pdf("x")) == "pdf"
    assert detect_kind("scan.jpg", make_png()) == "png"
    assert detect_kind("c.docx", make_docx()) == "docx"
    assert detect_kind("notes.md", b"# hi") == "text"
    with pytest.raises(UnsupportedDocument):
        detect_kind("evil.exe", b"MZ\x90\x00")
    with pytest.raises(UnsupportedDocument):
        detect_kind("fake.docx", b"PK\x03\x04garbage")


def test_extracts_pdf_text_layer():
    ex = extract("r.pdf", make_pdf("Lipid Panel\nLDL: 161 mg/dL"))
    assert ex.kind == "pdf" and not ex.needs_ocr and "LDL: 161 mg/dL" in ex.text


def test_scanned_pdf_and_images_need_ocr():
    assert extract("scan.pdf", make_scanned_pdf()).needs_ocr
    assert extract("photo.png", make_png()).needs_ocr


def test_extracts_docx_paragraphs_and_tables_in_order():
    text = extract("c.docx", make_docx()).text
    assert text.index("Compensation") < text.index("Base salary | Rs 18,00,000") < text.index("Termination")


# ---------------------------------------------------------------------------
# semantic chunking
# ---------------------------------------------------------------------------


def test_semantic_chunking_is_verbatim_and_hashes_match_source():
    result = asyncio.run(ingest_document("note.txt", UNSTRUCTURED.encode(), ai=FakeAI()))
    assert result.chunking == "semantic"
    labels = result.parsed.labels
    assert "Virology/HIV Screen" in labels and "Lipid Panel" in labels and "Billing Details" in labels
    for scope in result.parsed.scopes:
        for piece in scope.content.split("\n"):
            assert piece in UNSTRUCTURED  # every byte comes from the source
        assert scope.scope_hash == compute_scope_hash(result.parsed.salt, scope.label, scope.content)
    hiv = result.parsed.by_label("Virology/HIV Screen")
    assert "non-reactive" in hiv.content and "cholesterol" not in hiv.content
    assert hiv.keywords == ("virologyhiv",) or hiv.keywords  # keywords carried through


def test_images_are_transcribed_then_chunked():
    ai = FakeAI()
    result = asyncio.run(ingest_document("scan.png", make_png(), ai=ai))
    assert result.extraction == "ocr" and result.source_kind == "png"
    assert ai.calls[0] == ("transcribe", "image/png")
    assert result.parsed.labels == ["Virology/HIV Screen"]


def test_images_without_ai_are_rejected_cleanly():
    with pytest.raises(UnsupportedDocument):
        asyncio.run(ingest_document("scan.png", make_png(), ai=None))


def test_ai_failure_falls_back_to_rules_with_sentence_splitting():
    class Quota(Exception):
        code = 429

    result = asyncio.run(ingest_document("note.txt", UNSTRUCTURED.encode(), ai=FakeAI(fail=Quota())))
    assert result.chunking == "rules"
    assert any("quota" in w.lower() for w in result.warnings)
    # Heading-less fallback still isolates the HIV sentence.
    hiv = result.parsed.by_label("Virology/HIV Screen")
    assert "non-reactive" in hiv.content and "cholesterol" not in hiv.content


def test_plan_repair_duplicates_out_of_range_gaps_and_unsafe_labels():
    text = "Line zero.\nLine one.\nLine two.\nLine three."
    units = split_units(text)
    plan = [
        PlannedScope("HIV Negative 2024!", [0, 1, 99], ["hiv"]),  # digits stripped from public label
        PlannedScope("Other", [1, 3], ["Other", "x"]),  # unit 1 already claimed; unit 2 unassigned
    ]
    segs = segments_from_plan(text, units, plan)
    assert [s.label for s in segs] == ["HIV Negative", "Other"]
    assert segs[0].content == "Line zero.\nLine one.\nLine two."  # gap unit 2 joins preceding scope
    assert segs[1].content == "Line three."
    assert segs[1].keywords == ("other",)


def test_router_uses_semantic_keywords_for_custom_labels():
    parsed = DocumentParser().from_segments(
        segments_from_plan(
            "Salary is Rs 18L.\nNotice period is 60 days.",
            split_units("Salary is Rs 18L.\nNotice period is 60 days."),
            [PlannedScope("Compensation", [0], ["salary", "pay"]), PlannedScope("Termination", [1], ["notice", "quit"])],
        )
    )
    assert [s.label for s in ScopeRouter().relevant("How much pay do I get?", parsed.scopes)] == ["Compensation"]
