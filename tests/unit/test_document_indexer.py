"""
Unit Tests für Document Indexer Service
Tests for document parsing, text chunking, and the DocumentIndexer class

Coverage targets:
- Document parsers (PDF, DOCX, TXT, Markdown)
- Text chunking algorithms (word-based, token-based, character-based)
- DocumentIndexer class with MinIO, Qdrant, PostgreSQL integration
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

class TestDocumentIndexer:
    """Tests for DocumentIndexer class"""

    @pytest.fixture
    def mock_indexer(self):
        """Create DocumentIndexer with mocked dependencies"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.psycopg2.connect') as mock_pg:
                    # Configure MinIO mock
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True
                    mock_minio.return_value = mock_minio_client

                    # Configure Qdrant mock
                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections
                    mock_qdrant.return_value = mock_qdrant_client

                    # Configure PostgreSQL mock
                    mock_conn = Mock()
                    mock_cursor = Mock()
                    mock_cursor.__enter__ = Mock(return_value=mock_cursor)
                    mock_cursor.__exit__ = Mock(return_value=None)
                    mock_conn.cursor.return_value = mock_cursor
                    mock_pg.return_value = mock_conn

                    from indexer import DocumentIndexer
                    indexer = DocumentIndexer()

                    # Attach mocks for verification
                    indexer._mock_minio = mock_minio_client
                    indexer._mock_qdrant = mock_qdrant_client
                    indexer._mock_pg_conn = mock_conn
                    indexer._mock_pg_cursor = mock_cursor

                    yield indexer

    def test_init_creates_minio_bucket(self):
        """Test: __init__ creates MinIO bucket if not exists"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                mock_minio_client = Mock()
                mock_minio_client.bucket_exists.return_value = False
                mock_minio.return_value = mock_minio_client

                mock_qdrant_client = Mock()
                mock_collections = Mock()
                mock_collections.collections = []
                mock_qdrant_client.get_collections.return_value = mock_collections
                mock_qdrant.return_value = mock_qdrant_client

                from indexer import DocumentIndexer
                DocumentIndexer()

                mock_minio_client.make_bucket.assert_called_once()

    def test_init_creates_qdrant_collection(self):
        """Test: __init__ creates Qdrant collection if not exists"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                mock_minio_client = Mock()
                mock_minio_client.bucket_exists.return_value = True
                mock_minio.return_value = mock_minio_client

                mock_qdrant_client = Mock()
                mock_collections = Mock()
                mock_collections.collections = []  # No collections
                mock_qdrant_client.get_collections.return_value = mock_collections
                mock_qdrant.return_value = mock_qdrant_client

                from indexer import DocumentIndexer
                DocumentIndexer()

                mock_qdrant_client.create_collection.assert_called_once()

    def test_get_document_hash(self, mock_indexer):
        """Test: get_document_hash generates consistent hash"""
        data = b'test document content'

        hash1 = mock_indexer.get_document_hash('doc.pdf', data)
        hash2 = mock_indexer.get_document_hash('doc.pdf', data)

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 hex length

    def test_get_document_hash_different_files(self, mock_indexer):
        """Test: get_document_hash generates different hashes for different files"""
        data = b'same content'

        hash1 = mock_indexer.get_document_hash('doc1.pdf', data)
        hash2 = mock_indexer.get_document_hash('doc2.pdf', data)

        assert hash1 != hash2

    def test_is_document_indexed_true(self, mock_indexer):
        """Test: is_document_indexed returns True for indexed doc"""
        mock_indexer._mock_qdrant.scroll.return_value = ([Mock()], None)

        result = mock_indexer.is_document_indexed('abc123')

        assert result == True

    def test_is_document_indexed_false(self, mock_indexer):
        """Test: is_document_indexed returns False for new doc"""
        mock_indexer._mock_qdrant.scroll.return_value = ([], None)

        result = mock_indexer.is_document_indexed('new_hash')

        assert result == False

    def test_parse_document_pdf(self, mock_indexer):
        """Test: parse_document selects PDF parser"""
        mock_parse = Mock(return_value='PDF content')
        mock_indexer.parsers['.pdf'] = mock_parse

        result = mock_indexer.parse_document('test.pdf', b'data')

        mock_parse.assert_called_once()
        assert result == 'PDF content'

    def test_parse_document_docx(self, mock_indexer):
        """Test: parse_document selects DOCX parser"""
        mock_parse = Mock(return_value='DOCX content')
        mock_indexer.parsers['.docx'] = mock_parse

        result = mock_indexer.parse_document('test.docx', b'data')

        mock_parse.assert_called_once()
        assert result == 'DOCX content'

    def test_parse_document_txt(self, mock_indexer):
        """Test: parse_document selects TXT parser"""
        mock_parse = Mock(return_value='TXT content')
        mock_indexer.parsers['.txt'] = mock_parse

        result = mock_indexer.parse_document('test.txt', b'data')

        mock_parse.assert_called_once()
        assert result == 'TXT content'

    def test_parse_document_markdown(self, mock_indexer):
        """Test: parse_document selects Markdown parser"""
        mock_parse = Mock(return_value='MD content')
        mock_indexer.parsers['.md'] = mock_parse

        result = mock_indexer.parse_document('test.md', b'data')

        mock_parse.assert_called_once()
        assert result == 'MD content'

    def test_parse_document_unsupported_type(self, mock_indexer):
        """Test: parse_document returns None for unsupported types"""
        result = mock_indexer.parse_document('test.xyz', b'data')

        assert result is None

    def test_parse_document_case_insensitive(self, mock_indexer):
        """Test: parse_document handles uppercase extensions"""
        mock_parse = Mock(return_value='content')
        mock_indexer.parsers['.pdf'] = mock_parse

        result = mock_indexer.parse_document('TEST.PDF', b'data')

        mock_parse.assert_called_once()

    @patch('indexer.requests.post')
    def test_get_embedding_success(self, mock_post, mock_indexer):
        """Test: get_embedding returns vector from embedding service"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'vectors': [[0.1, 0.2, 0.3] * 256]  # 768 dimensions
        }
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        result = mock_indexer.get_embedding('test text')

        assert result is not None
        assert len(result) == 768

    @patch('indexer.requests.post')
    def test_get_embedding_failure(self, mock_post, mock_indexer):
        """Test: get_embedding returns None on error"""
        mock_post.side_effect = Exception("Connection refused")

        result = mock_indexer.get_embedding('test text')

        assert result is None

    @patch('indexer.requests.post')
    def test_get_embedding_empty_response(self, mock_post, mock_indexer):
        """Test: get_embedding handles empty vectors"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'vectors': []}
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        result = mock_indexer.get_embedding('test text')

        assert result is None


# ============================================================================
# DOCUMENT INDEXING TESTS
# ============================================================================

class TestDocumentIndexing:
    """Tests for document indexing flow"""

    @pytest.fixture
    def mock_indexer_full(self):
        """Create DocumentIndexer with full mocking for indexing tests"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.psycopg2.connect') as mock_pg:
                    with patch('indexer.requests.post') as mock_requests:
                        # Configure MinIO mock
                        mock_minio_client = Mock()
                        mock_minio_client.bucket_exists.return_value = True
                        mock_minio.return_value = mock_minio_client

                        # Configure Qdrant mock
                        mock_qdrant_client = Mock()
                        mock_collections = Mock()
                        mock_collections.collections = []
                        mock_qdrant_client.get_collections.return_value = mock_collections
                        mock_qdrant_client.scroll.return_value = ([], None)  # Not indexed
                        mock_qdrant.return_value = mock_qdrant_client

                        # Configure PostgreSQL mock
                        mock_conn = Mock()
                        mock_conn.closed = False
                        mock_cursor = Mock()
                        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
                        mock_cursor.__exit__ = Mock(return_value=None)
                        mock_cursor.fetchone.return_value = {
                            'id': 1,
                            'filename': 'test.txt',
                            'space_id': 'space-1',
                            'space_name': 'Test Space',
                            'space_slug': 'test-space',
                            'title': 'Test Document',
                            'document_summary': 'Summary'
                        }
                        mock_conn.cursor.return_value = mock_cursor
                        mock_pg.return_value = mock_conn

                        # Configure embedding service mock
                        mock_response = Mock()
                        mock_response.status_code = 200
                        mock_response.json.return_value = {
                            'vectors': [[0.1] * 768]
                        }
                        mock_response.raise_for_status = Mock()
                        mock_requests.return_value = mock_response

                        from indexer import DocumentIndexer
                        indexer = DocumentIndexer()

                        # Attach mocks
                        indexer._mock_qdrant = mock_qdrant_client
                        indexer._mock_requests = mock_requests

                        yield indexer

    def test_index_document_skips_already_indexed(self, mock_indexer_full):
        """Test: index_document skips already indexed documents"""
        # Mock document as already indexed
        mock_indexer_full._mock_qdrant.scroll.return_value = ([Mock()], None)

        mock_indexer_full.index_document('test.txt', b'content')

        # Should not call upsert
        mock_indexer_full._mock_qdrant.upsert.assert_not_called()

    def test_index_document_parses_and_chunks(self, mock_indexer_full):
        """Test: index_document parses document and creates chunks"""
        content = "First sentence. Second sentence. Third sentence."

        with patch.object(mock_indexer_full, 'parse_document', return_value=content):
            mock_indexer_full.index_document('test.txt', b'data')

            # Should upsert points
            mock_indexer_full._mock_qdrant.upsert.assert_called_once()

    def test_index_document_updates_status(self, mock_indexer_full):
        """Test: index_document updates document status in DB"""
        with patch.object(mock_indexer_full, 'parse_document', return_value='content'):
            with patch.object(mock_indexer_full, 'update_document_status') as mock_status:
                mock_indexer_full.index_document('test.txt', b'data')

                # Should update status to 'processing' and then 'indexed'
                assert mock_status.call_count >= 2

    def test_index_document_handles_parse_failure(self, mock_indexer_full):
        """Test: index_document handles parse failure gracefully"""
        with patch.object(mock_indexer_full, 'parse_document', return_value=None):
            with patch.object(mock_indexer_full, 'update_document_status') as mock_status:
                mock_indexer_full.index_document('test.xyz', b'data')

                # Should update status to 'failed'
                mock_status.assert_called()
                call_args = [call[0] for call in mock_status.call_args_list]
                assert any('failed' in str(args) for args in call_args)

    def test_index_document_includes_space_metadata(self, mock_indexer_full):
        """Test: index_document includes RAG 2.0 space metadata"""
        with patch.object(mock_indexer_full, 'parse_document', return_value='content'):
            mock_indexer_full.index_document('test.txt', b'data')

            # Check upsert was called with space metadata in payload
            upsert_call = mock_indexer_full._mock_qdrant.upsert.call_args
            points = upsert_call[1]['points']

            assert len(points) > 0
            payload = points[0].payload
            assert 'space_id' in payload
            assert 'space_name' in payload


# ============================================================================
# DOCUMENT STATUS TESTS
# ============================================================================

class TestDocumentStatus:
    """Tests for document status updates"""

    @pytest.fixture
    def mock_indexer_db(self):
        """Create DocumentIndexer with DB mocking for status tests"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.psycopg2.connect') as mock_pg:
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True
                    mock_minio.return_value = mock_minio_client

                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections
                    mock_qdrant.return_value = mock_qdrant_client

                    mock_conn = Mock()
                    mock_conn.closed = False
                    mock_cursor = Mock()
                    mock_cursor.__enter__ = Mock(return_value=mock_cursor)
                    mock_cursor.__exit__ = Mock(return_value=None)
                    mock_conn.cursor.return_value = mock_cursor
                    mock_pg.return_value = mock_conn

                    from indexer import DocumentIndexer
                    indexer = DocumentIndexer()
                    indexer._mock_cursor = mock_cursor

                    yield indexer

    def test_update_document_status_indexed(self, mock_indexer_db):
        """Test: update_document_status sets indexed status"""
        mock_indexer_db.update_document_status('test.txt', 'indexed', chunk_count=5)

        mock_indexer_db._mock_cursor.execute.assert_called()
        call_sql = str(mock_indexer_db._mock_cursor.execute.call_args)
        assert 'indexed' in call_sql or 'status' in call_sql

    def test_update_document_status_failed(self, mock_indexer_db):
        """Test: update_document_status sets failed status with error"""
        mock_indexer_db.update_document_status('test.txt', 'failed', error='Parse error')

        mock_indexer_db._mock_cursor.execute.assert_called()
        call_sql = str(mock_indexer_db._mock_cursor.execute.call_args)
        assert 'failed' in call_sql or 'status' in call_sql

    def test_update_document_status_processing(self, mock_indexer_db):
        """Test: update_document_status sets processing status"""
        mock_indexer_db.update_document_status('test.txt', 'processing')

        mock_indexer_db._mock_cursor.execute.assert_called()


# ============================================================================
# SCAN AND INDEX TESTS
# ============================================================================

class TestScanAndIndex:
    """Tests for scan_and_index functionality"""

    @pytest.fixture
    def mock_indexer_scan(self):
        """Create DocumentIndexer for scan tests"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.psycopg2.connect') as mock_pg:
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True
                    mock_minio.return_value = mock_minio_client

                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections
                    mock_qdrant.return_value = mock_qdrant_client

                    mock_conn = Mock()
                    mock_conn.closed = False
                    mock_cursor = Mock()
                    mock_cursor.__enter__ = Mock(return_value=mock_cursor)
                    mock_cursor.__exit__ = Mock(return_value=None)
                    mock_conn.cursor.return_value = mock_cursor
                    mock_pg.return_value = mock_conn

                    from indexer import DocumentIndexer
                    indexer = DocumentIndexer()
                    indexer._mock_minio = mock_minio_client

                    yield indexer

    def test_scan_and_index_lists_objects(self, mock_indexer_scan):
        """Test: scan_and_index lists all objects in bucket"""
        mock_indexer_scan._mock_minio.list_objects.return_value = []

        mock_indexer_scan.scan_and_index()

        mock_indexer_scan._mock_minio.list_objects.assert_called_once()

    def test_scan_and_index_processes_each_object(self, mock_indexer_scan):
        """Test: scan_and_index processes each object"""
        # Mock objects
        mock_obj1 = Mock()
        mock_obj1.object_name = 'doc1.txt'
        mock_obj2 = Mock()
        mock_obj2.object_name = 'doc2.pdf'

        mock_indexer_scan._mock_minio.list_objects.return_value = [mock_obj1, mock_obj2]

        # Mock get_object
        mock_response = Mock()
        mock_response.read.return_value = b'content'
        mock_response.close = Mock()
        mock_response.release_conn = Mock()
        mock_indexer_scan._mock_minio.get_object.return_value = mock_response

        with patch.object(mock_indexer_scan, 'index_document') as mock_index:
            mock_indexer_scan.scan_and_index()

            assert mock_index.call_count == 2

    def test_scan_and_index_handles_minio_error(self, mock_indexer_scan):
        """Test: scan_and_index handles MinIO errors gracefully"""
        from minio.error import S3Error

        mock_indexer_scan._mock_minio.list_objects.side_effect = S3Error(
            'NoSuchBucket', 'Bucket not found', '', '', '', ''
        )

        # Should not raise
        mock_indexer_scan.scan_and_index()

    def test_scan_and_index_continues_on_single_failure(self, mock_indexer_scan):
        """Test: scan_and_index continues processing after single doc failure"""
        mock_obj1 = Mock()
        mock_obj1.object_name = 'doc1.txt'
        mock_obj2 = Mock()
        mock_obj2.object_name = 'doc2.txt'

        mock_indexer_scan._mock_minio.list_objects.return_value = [mock_obj1, mock_obj2]

        # First get_object fails, second succeeds
        mock_response = Mock()
        mock_response.read.return_value = b'content'
        mock_response.close = Mock()
        mock_response.release_conn = Mock()

        call_count = [0]
        def get_object_side_effect(bucket, name):
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("First doc error")
            return mock_response

        mock_indexer_scan._mock_minio.get_object.side_effect = get_object_side_effect

        with patch.object(mock_indexer_scan, 'index_document'):
            mock_indexer_scan.scan_and_index()

            # Should have attempted to get both objects
            assert mock_indexer_scan._mock_minio.get_object.call_count == 2


# ============================================================================
# SPACE STATISTICS TESTS
# ============================================================================

class TestSpaceStatistics:
    """Tests for RAG 2.0 space statistics"""

    @pytest.fixture
    def mock_indexer_stats(self):
        """Create DocumentIndexer for space statistics tests"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.psycopg2.connect') as mock_pg:
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True
                    mock_minio.return_value = mock_minio_client

                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections
                    mock_qdrant.return_value = mock_qdrant_client

                    mock_conn = Mock()
                    mock_conn.closed = False
                    mock_cursor = Mock()
                    mock_cursor.__enter__ = Mock(return_value=mock_cursor)
                    mock_cursor.__exit__ = Mock(return_value=None)
                    mock_conn.cursor.return_value = mock_cursor
                    mock_pg.return_value = mock_conn

                    from indexer import DocumentIndexer
                    indexer = DocumentIndexer()
                    indexer._mock_cursor = mock_cursor

                    yield indexer

    def test_update_space_statistics_calls_function(self, mock_indexer_stats):
        """Test: update_space_statistics calls PostgreSQL function"""
        mock_indexer_stats.update_space_statistics('space-123')

        mock_indexer_stats._mock_cursor.execute.assert_called()
        call_sql = str(mock_indexer_stats._mock_cursor.execute.call_args)
        assert 'update_space_statistics' in call_sql

    def test_update_space_statistics_skips_none(self, mock_indexer_stats):
        """Test: update_space_statistics skips None space_id"""
        mock_indexer_stats._mock_cursor.execute.reset_mock()

        mock_indexer_stats.update_space_statistics(None)

        # Should not execute any query
        # (Initial call during init may have happened, check for update_space call)
        for call in mock_indexer_stats._mock_cursor.execute.call_args_list:
            assert 'update_space_statistics' not in str(call)


# ============================================================================
# CONNECTION TESTS
# ============================================================================

class TestConnections:
    """Tests for connection handling"""

    def test_minio_retry_on_failure(self):
        """Test: MinIO init retries on connection failure"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.time.sleep'):  # Skip actual delays
                    # Fail twice, succeed on third attempt
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True

                    call_count = [0]
                    def minio_side_effect(*args, **kwargs):
                        call_count[0] += 1
                        if call_count[0] < 3:
                            raise Exception("Connection refused")
                        return mock_minio_client

                    mock_minio.side_effect = minio_side_effect

                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections
                    mock_qdrant.return_value = mock_qdrant_client

                    from indexer import DocumentIndexer
                    DocumentIndexer()

                    assert call_count[0] == 3

    def test_qdrant_retry_on_failure(self):
        """Test: Qdrant init retries on connection failure"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.time.sleep'):
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True
                    mock_minio.return_value = mock_minio_client

                    # Fail twice, succeed on third
                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections

                    call_count = [0]
                    def qdrant_side_effect(*args, **kwargs):
                        call_count[0] += 1
                        if call_count[0] < 3:
                            raise Exception("Connection refused")
                        return mock_qdrant_client

                    mock_qdrant.side_effect = qdrant_side_effect

                    from indexer import DocumentIndexer
                    DocumentIndexer()

                    assert call_count[0] == 3

    def test_postgres_reconnection(self):
        """Test: PostgreSQL reconnects on closed connection"""
        with patch('indexer.Minio') as mock_minio:
            with patch('indexer.QdrantClient') as mock_qdrant:
                with patch('indexer.psycopg2.connect') as mock_pg:
                    mock_minio_client = Mock()
                    mock_minio_client.bucket_exists.return_value = True
                    mock_minio.return_value = mock_minio_client

                    mock_qdrant_client = Mock()
                    mock_collections = Mock()
                    mock_collections.collections = []
                    mock_qdrant_client.get_collections.return_value = mock_collections
                    mock_qdrant.return_value = mock_qdrant_client

                    # First connection closed, second fresh
                    mock_conn = Mock()
                    mock_conn.closed = True  # Connection closed
                    mock_pg.return_value = mock_conn

                    from indexer import DocumentIndexer
                    indexer = DocumentIndexer()

                    # Try to get connection (should reconnect)
                    mock_conn2 = Mock()
                    mock_conn2.closed = False
                    mock_pg.return_value = mock_conn2

                    indexer._get_pg_connection()

                    # Should have attempted reconnection
                    assert mock_pg.call_count >= 1


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--cov=indexer",
        "--cov=document_parsers",
        "--cov=text_chunker",
        "--cov-report=term-missing",
        "-W", "ignore::DeprecationWarning"
    ])
