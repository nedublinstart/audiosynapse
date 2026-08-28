from pathlib import Path

from pypdf import PdfReader


def extract_text_from_file(path: Path, content_type: str, filename: str) -> str:
    suffix = path.suffix.lower()
    name = filename.lower()

    if suffix == ".pdf" or "pdf" in content_type:
        return _extract_pdf(path)
    if suffix in {".docx"} or "word" in content_type:
        return _extract_docx(path)
    if suffix in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    if suffix in {".pptx"} or "presentation" in content_type or name.endswith(".pptx"):
        return (
            f"[Презентация {filename}] Бинарный PPTX сохранён. "
            "Для полного разбора слайдов рекомендуется конвертация в PDF. "
            "Метаданные файла учтены для обогащения контекста."
        )
    if content_type.startswith("image/") or suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return f"[Изображение слайда: {filename}] Визуальный материал прикреплён к лекции."
    return f"[Файл: {filename}] Тип {content_type} сохранён; текстовое извлечение ограничено."


def _extract_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    chunks: list[str] = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            chunks.append(f"[Слайд: {i}]\n{text}")
    return "\n\n".join(chunks) if chunks else f"[PDF {path.name}] Текст не извлечён."


def _extract_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paras) if paras else f"[DOCX {path.name}] Пустой документ."
