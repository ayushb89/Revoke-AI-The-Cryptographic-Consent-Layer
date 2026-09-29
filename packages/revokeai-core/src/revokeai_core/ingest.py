"""File type detection and native text extraction.

Supported: plain text / Markdown, PDF (via PyMuPDF), Word .docx (via
python-docx) and PNG/JPEG images. Images and scanned PDFs have no text layer;
they are flagged `needs_ocr` so a multimodal model can transcribe them.

Types are detected from the file's magic bytes, not just its extension, so a
renamed file cannot smuggle a different format past the parser.
"""

import io
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

MAX_PDF_PAGES = 50
# A PDF averaging fewer extractable characters per page than this is treated as scanned.
MIN_CHARS_PER_PAGE = 40

MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "png": "image/png",
    "jpeg": "image/jpeg",
    "text": "text/plain",
}
TEXT_SUFFIXES = {".txt", ".md", ".markdown", ".text"}
SUPPORTED_DESCRIPTION = "Supported files: .txt, .md, .pdf, .docx, .png, .jpg, .jpeg"


class UnsupportedDocument(ValueError):
    """The file type is not supported or the file is malformed."""


@dataclass(frozen=True)
class Extraction:
    kind: str  # "text" | "pdf" | "docx" | "png" | "jpeg"
    text: str
    needs_ocr: bool
    pages: int | None = None

    @property
    def mime_type(self) -> str:
        return MIME_TYPES[self.kind]


def detect_kind(filename: str, data: bytes) -> str:
    suffix = PurePath(filename or "").suffix.lower()
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if "word/document.xml" in z.namelist():
                    return "docx"
        except zipfile.BadZipFile:
            pass
        raise UnsupportedDocument(f"Unrecognised archive. {SUPPORTED_DESCRIPTION}")
    if suffix in TEXT_SUFFIXES or suffix == "":
        try:
            data.decode("utf-8-sig")
            return "text"
        except UnicodeDecodeError:
            raise UnsupportedDocument("Text files must be UTF-8.")
    raise UnsupportedDocument(f"Unsupported file type '{suffix or 'unknown'}'. {SUPPORTED_DESCRIPTION}")


def extract(filename: str, data: bytes) -> Extraction:
    kind = detect_kind(filename, data)
    if kind == "text":
        return Extraction(kind, _normalise(data.decode("utf-8-sig")), needs_ocr=False)
    if kind == "pdf":
        return _extract_pdf(data)
    if kind == "docx":
        return Extraction(kind, _extract_docx(data), needs_ocr=False)
    return Extraction(kind, "", needs_ocr=True)  # png / jpeg


def _extract_pdf(data: bytes) -> Extraction:
    try:
        import pymupdf
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise UnsupportedDocument("PDF support requires the 'pymupdf' package.") from exc
    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            if doc.needs_pass:
                raise UnsupportedDocument("Password-protected PDFs are not supported.")
            if doc.page_count > MAX_PDF_PAGES:
                raise UnsupportedDocument(f"PDF has {doc.page_count} pages; the limit is {MAX_PDF_PAGES}.")
            pages = [page.get_text("text", sort=True) for page in doc]
            has_images = any(page.get_images(full=False) for page in doc)
            count = doc.page_count
    except UnsupportedDocument:
        raise
    except Exception as exc:
        raise UnsupportedDocument("The PDF could not be read (it may be corrupt).") from exc
    text = _normalise("\n\n".join(p.strip() for p in pages if p.strip()))
    # Scanned = no text layer, or a thin one alongside page images.
    scanned = count > 0 and (not text or (has_images and len(text) < MIN_CHARS_PER_PAGE * count))
    return Extraction("pdf", text, needs_ocr=scanned, pages=count)


def _extract_docx(data: bytes) -> str:
    try:
        import docx
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise UnsupportedDocument("Word support requires the 'python-docx' package.") from exc
    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise UnsupportedDocument("The Word document could not be read (it may be corrupt).") from exc

    # Walk the body in document order so tables stay where they appear.
    lines: list[str] = []
    body = document.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = "".join(t.text or "" for t in child.iter() if t.tag.endswith("}t"))
            lines.append(text)
        elif tag == "tbl":
            for row in child.iter():
                if row.tag.endswith("}tr"):
                    cells = []
                    for cell in row.iterchildren():
                        if cell.tag.endswith("}tc"):
                            cells.append(" ".join("".join(t.text or "" for t in p.iter() if t.tag.endswith("}t")) for p in cell.iter() if p.tag.endswith("}p")).strip())
                    lines.append(" | ".join(c for c in cells if c))
            lines.append("")
    return _normalise("\n".join(lines))


def _normalise(text: str) -> str:
    """Canonical text that all hashing is based on: LF newlines, no trailing
    spaces, at most one blank line in a row."""
    out: list[str] = []
    blank = False
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = line.rstrip()
        if not line:
            if not blank and out:
                out.append("")
            blank = True
        else:
            out.append(line)
            blank = False
    return "\n".join(out).strip()
