from __future__ import annotations

from pathlib import Path
from typing import Iterable, Iterator, Union

from docx import Document
from docx.oxml import OxmlElement
from docx.table import Table
from docx.text.paragraph import Paragraph


BlockItem = Union[Paragraph, Table]


def iter_block_items(doc: Document) -> Iterator[BlockItem]:
    parent = doc.element.body
    for child in parent.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, doc)
        elif child.tag.endswith("}tbl"):
            yield Table(child, doc)


def insert_paragraph_after(paragraph: Paragraph, text: str, style: str = "Normal") -> Paragraph:
    new_p = OxmlElement("w:p")
    paragraph._p.addnext(new_p)
    new_para = Paragraph(new_p, paragraph._parent)
    new_para.style = style
    new_para.add_run(text)
    return new_para


def is_effectively_empty_paragraph(p: Paragraph) -> bool:
    return not p.text or not p.text.strip()


def ensure_description_after_heading(
    blocks: list[BlockItem],
    heading_text: str,
    description_text: str,
) -> int:
    """Insert a Normal paragraph after a heading paragraph iff the next block is a table or another heading.

    Returns number of insertions performed (0 or 1).
    """
    inserted = 0

    for i, block in enumerate(blocks):
        if not isinstance(block, Paragraph):
            continue
        if block.text.strip() != heading_text:
            continue

        # Find next non-empty paragraph/table block
        j = i + 1
        while j < len(blocks) and isinstance(blocks[j], Paragraph) and is_effectively_empty_paragraph(blocks[j]):
            j += 1

        if j >= len(blocks):
            # end of doc; safe to insert
            insert_paragraph_after(block, description_text, style="Normal")
            inserted += 1
            break

        next_block = blocks[j]

        # If next is a table, insert.
        if isinstance(next_block, Table):
            insert_paragraph_after(block, description_text, style="Normal")
            inserted += 1
            break

        # If next is a paragraph and looks like another heading, insert.
        if isinstance(next_block, Paragraph):
            next_style = (next_block.style.name or "").lower()
            if "heading" in next_style:
                insert_paragraph_after(block, description_text, style="Normal")
                inserted += 1
                break

            # If there's already normal text content, do not insert.

        break

    return inserted


def main() -> None:
    doc_path = Path("docx") / "Chapter 3-smarthub.docx"
    doc = Document(doc_path)

    blocks = list(iter_block_items(doc))

    inserts = 0

    inserts += ensure_description_after_heading(
        blocks,
        "Data Dictionary",
        "This section defines the key local tables/fields used by SmartHub to store diagnostic runs, USB evidence, and offline helper cases. Descriptions clarify each field’s purpose while keeping all processing local/offline by default.",
    )

    inserts += ensure_description_after_heading(
        blocks,
        "Offline_AI_Cases",
        "Stores prior offline-only diagnostic cases used for similarity matching and safe suggestion generation; cases include timestamps, a fingerprint, and basic device descriptors.",
    )

    inserts += ensure_description_after_heading(
        blocks,
        "DiagnosticRun",
        "Stores each diagnostic run metadata and its summarized results; it links to collected device info payloads and any generated reports.",
    )

    inserts += ensure_description_after_heading(
        blocks,
        "ADB_AI_Cases",
        "Stores ADB-derived feature sets and labeled conclusions for offline analysis; used only when ADB is available and never to override USB-only truthfulness gates.",
    )

    inserts += ensure_description_after_heading(
        blocks,
        "BsodUsbOnlyReport",
        "Stores the USB-only BSOD triage report produced from Windows-side USB enumeration and stability signals; includes evidence JSON references and the primary reason for the suggested category.",
    )

    if inserts:
        doc.save(doc_path)

    print(f"Updated: {doc_path}")
    print(f"Inserted paragraphs: {inserts}")


if __name__ == "__main__":
    main()
