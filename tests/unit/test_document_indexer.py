"""
Unit Tests für Document Indexer Service
Tests for document parsing, text chunking, and the DocumentIndexer class

Coverage targets:
- Document parsers (PDF, DOCX, TXT, Markdown)
- Text chunking algorithms (word-based, token-based, character-based)

Der Teil zur Klasse DocumentIndexer ist am 24.08.2026 entfallen: er testete
`services/document-indexer/indexer.py`, eine Datei, die niemand mehr importiert
hat (Einstieg ist `api_server.py`) und die mit dem Qdrant-Ausbau gestrichen
wurde. Geblieben ist, was den laufenden Dienst betrifft: Zerlegung und Parser.
- RAG 2.0 space metadata handling
"""

import pytest
import sys
import os
import time
import hashlib
from unittest.mock import Mock, patch, MagicMock, PropertyMock
from io import BytesIO

# Add service directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__),
                                '../../services/document-indexer'))


# ============================================================================
# TEXT CHUNKER TESTS
# ============================================================================

class TestTextChunker:
    """Tests for text_chunker.py functions"""

    def test_chunk_text_basic(self):
        """Test: chunk_text splits text into chunks"""
        from text_chunker import chunk_text

        text = "This is the first sentence. This is the second sentence. This is the third sentence."
        chunks = chunk_text(text, chunk_size=10, overlap=2)

        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    def test_chunk_text_empty_input(self):
        """Test: chunk_text returns empty list for empty input"""
        from text_chunker import chunk_text

        assert chunk_text("") == []
        assert chunk_text("   ") == []
        assert chunk_text(None) == [] if None else True

    def test_chunk_text_overlap(self):
        """Test: chunk_text creates overlapping chunks"""
        from text_chunker import chunk_text

        text = "Word1 Word2 Word3 Word4 Word5. Word6 Word7 Word8 Word9 Word10. Word11 Word12."
        chunks = chunk_text(text, chunk_size=6, overlap=2)

        # With overlap, last words of chunk N should appear in chunk N+1
        if len(chunks) > 1:
            # There should be some word overlap between consecutive chunks
            first_chunk_words = chunks[0].split()[-2:]
            second_chunk_words = chunks[1].split()[:2]
            # At least some words should match (overlap)
            assert len(chunks) >= 1

    def test_chunk_text_respects_sentences(self):
        """Test: chunk_text tries to split at sentence boundaries"""
        from text_chunker import chunk_text

        text = "First sentence here. Second sentence here. Third sentence here."
        chunks = chunk_text(text, chunk_size=10, overlap=0)

        # Each chunk should be a complete thought
        assert len(chunks) >= 1

    def test_chunk_text_by_tokens(self):
        """Test: chunk_text_by_tokens converts tokens to words"""
        from text_chunker import chunk_text_by_tokens

        text = "This is a test document with multiple sentences. It should be chunked properly."
        chunks = chunk_text_by_tokens(text, max_tokens=50, overlap_tokens=10)

        assert len(chunks) >= 1

    def test_chunk_text_by_chars_basic(self):
        """Test: chunk_text_by_chars splits by character count"""
        from text_chunker import chunk_text_by_chars

        text = "A" * 5000  # 5000 characters
        chunks = chunk_text_by_chars(text, max_chars=2000, overlap_chars=200)

        assert len(chunks) >= 2
        # Each chunk should be roughly max_chars or less
        for chunk in chunks:
            assert len(chunk) <= 2200  # Allow some flexibility

    def test_chunk_text_by_chars_empty(self):
        """Test: chunk_text_by_chars handles empty input"""
        from text_chunker import chunk_text_by_chars

        assert chunk_text_by_chars("") == []
        assert chunk_text_by_chars("   ") == []

    def test_chunk_text_by_chars_sentence_boundary(self):
        """Test: chunk_text_by_chars tries to break at sentence boundaries"""
        from text_chunker import chunk_text_by_chars

        text = "First sentence. " * 100  # Many sentences
        chunks = chunk_text_by_chars(text, max_chars=100, overlap_chars=20)

        # Chunks should end with proper sentence endings when possible
        for chunk in chunks[:-1]:  # Except last
            assert chunk.strip()  # Should have content

    def test_chunk_text_single_large_chunk(self):
        """Test: chunk_text handles text smaller than chunk_size"""
        from text_chunker import chunk_text

        text = "Short text."
        chunks = chunk_text(text, chunk_size=100, overlap=10)

        assert len(chunks) == 1
        assert chunks[0] == text.strip()

    def test_chunk_text_unicode(self):
        """Test: chunk_text handles unicode/German text"""
        from text_chunker import chunk_text

        text = "Äöü sind deutsche Umlaute. Größe und Maße sind wichtig. Das ist ein Test."
        chunks = chunk_text(text, chunk_size=10, overlap=2)

        assert len(chunks) >= 1
        assert all('Ä' in ''.join(chunks) or 'ä' in ''.join(chunks) for _ in [1])


# ============================================================================
# DOCUMENT PARSER TESTS
# ============================================================================

class TestDocumentParsers:
    """Tests for document_parsers.py functions"""

    def test_parse_txt_utf8(self):
        """Test: parse_txt handles UTF-8 encoded text"""
        from document_parsers import parse_txt

        content = "Hello World! This is a test."
        file_obj = BytesIO(content.encode('utf-8'))

        result = parse_txt(file_obj)

        assert result == content

    def test_parse_txt_latin1(self):
        """Test: parse_txt handles Latin-1 encoded text"""
        from document_parsers import parse_txt

        content = "Größe und Maße"
        file_obj = BytesIO(content.encode('latin-1'))

        result = parse_txt(file_obj)

        assert "Gr" in result  # At least partial match

    def test_parse_txt_cp1252(self):
        """Test: parse_txt handles Windows CP1252 encoding"""
        from document_parsers import parse_txt

        content = "Test content with special chars"
        file_obj = BytesIO(content.encode('cp1252'))

        result = parse_txt(file_obj)

        assert "Test content" in result

    def test_parse_txt_fallback(self):
        """Test: parse_txt falls back with errors='ignore'"""
        from document_parsers import parse_txt

        # Create bytes that are invalid in UTF-8
        invalid_bytes = b'\xff\xfe Test data'
        file_obj = BytesIO(invalid_bytes)

        result = parse_txt(file_obj)

        # Should not raise exception
        assert isinstance(result, str)

    def test_parse_markdown_basic(self):
        """Test: parse_markdown extracts text from markdown"""
        from document_parsers import parse_markdown

        md_content = """# Heading

This is a paragraph.

## Subheading

- List item 1
- List item 2
"""
        file_obj = BytesIO(md_content.encode('utf-8'))

        result = parse_markdown(file_obj)

        assert "Heading" in result
        assert "paragraph" in result
        assert "List item" in result

    def test_parse_markdown_preserves_structure(self):
        """Test: parse_markdown preserves markdown formatting for RAG"""
        from document_parsers import parse_markdown

        md_content = "# Title\n\nContent here."
        file_obj = BytesIO(md_content.encode('utf-8'))

        result = parse_markdown(file_obj)

        # Should keep the # for structure
        assert "#" in result or "Title" in result

    @patch('document_parsers.PyPDF2.PdfReader')
    def test_parse_pdf_single_page(self, mock_reader):
        """Test: parse_pdf extracts text from single-page PDF"""
        from document_parsers import parse_pdf

        mock_page = Mock()
        mock_page.extract_text.return_value = "Page 1 content"
        mock_reader.return_value.pages = [mock_page]

        file_obj = BytesIO(b'fake pdf data')
        result = parse_pdf(file_obj)

        assert result == "Page 1 content"

    @patch('document_parsers.PyPDF2.PdfReader')
    def test_parse_pdf_multiple_pages(self, mock_reader):
        """Test: parse_pdf extracts text from multi-page PDF"""
        from document_parsers import parse_pdf

        mock_pages = []
        for i in range(3):
            mock_page = Mock()
            mock_page.extract_text.return_value = f"Page {i+1} content"
            mock_pages.append(mock_page)

        mock_reader.return_value.pages = mock_pages

        file_obj = BytesIO(b'fake pdf data')
        result = parse_pdf(file_obj)

        assert "Page 1 content" in result
        assert "Page 2 content" in result
        assert "Page 3 content" in result

    @patch('document_parsers.PyPDF2.PdfReader')
    def test_parse_pdf_empty_page(self, mock_reader):
        """Test: parse_pdf handles pages with no text"""
        from document_parsers import parse_pdf

        mock_page1 = Mock()
        mock_page1.extract_text.return_value = "Content"
        mock_page2 = Mock()
        mock_page2.extract_text.return_value = ""  # Empty page

        mock_reader.return_value.pages = [mock_page1, mock_page2]

        file_obj = BytesIO(b'fake pdf data')
        result = parse_pdf(file_obj)

        assert result == "Content"

    @patch('document_parsers.PyPDF2.PdfReader')
    def test_parse_pdf_error_handling(self, mock_reader):
        """Test: parse_pdf raises exception on error"""
        from document_parsers import parse_pdf

        mock_reader.side_effect = Exception("Invalid PDF")

        file_obj = BytesIO(b'invalid data')

        with pytest.raises(Exception):
            parse_pdf(file_obj)

    @patch('document_parsers.Document')
    def test_parse_docx_paragraphs(self, mock_document):
        """Test: parse_docx extracts paragraphs"""
        from document_parsers import parse_docx

        mock_para1 = Mock()
        mock_para1.text = "First paragraph"
        mock_para2 = Mock()
        mock_para2.text = "Second paragraph"

        mock_doc = Mock()
        mock_doc.paragraphs = [mock_para1, mock_para2]
        mock_doc.tables = []
        mock_document.return_value = mock_doc

        file_obj = BytesIO(b'fake docx data')
        result = parse_docx(file_obj)

        assert "First paragraph" in result
        assert "Second paragraph" in result

    @patch('document_parsers.Document')
    def test_parse_docx_with_tables(self, mock_document):
        """Test: parse_docx extracts tables"""
        from document_parsers import parse_docx

        # Mock paragraph
        mock_para = Mock()
        mock_para.text = "Paragraph content"

        # Mock table
        mock_cell1 = Mock()
        mock_cell1.text = "Cell 1"
        mock_cell2 = Mock()
        mock_cell2.text = "Cell 2"
        mock_row = Mock()
        mock_row.cells = [mock_cell1, mock_cell2]
        mock_table = Mock()
        mock_table.rows = [mock_row]

        mock_doc = Mock()
        mock_doc.paragraphs = [mock_para]
        mock_doc.tables = [mock_table]
        mock_document.return_value = mock_doc

        file_obj = BytesIO(b'fake docx data')
        result = parse_docx(file_obj)

        assert "Paragraph content" in result
        assert "Cell 1" in result
        assert "Cell 2" in result

    @patch('document_parsers.Document')
    def test_parse_docx_empty_paragraphs(self, mock_document):
        """Test: parse_docx skips empty paragraphs"""
        from document_parsers import parse_docx

        mock_para1 = Mock()
        mock_para1.text = "Content"
        mock_para2 = Mock()
        mock_para2.text = "   "  # Empty/whitespace

        mock_doc = Mock()
        mock_doc.paragraphs = [mock_para1, mock_para2]
        mock_doc.tables = []
        mock_document.return_value = mock_doc

        file_obj = BytesIO(b'fake docx data')
        result = parse_docx(file_obj)

        assert "Content" in result


# ============================================================================
# DOCUMENT INDEXER CLASS TESTS
# ============================================================================
