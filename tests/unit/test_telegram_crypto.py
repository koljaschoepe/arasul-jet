"""
Unit tests for Telegram Bot Cryptographic Services.

These tests are designed to run without the actual telegram-bot dependencies
installed, using mocks and import guards.
"""

import pytest
import sys
import os
from unittest.mock import patch

# Add telegram-bot service to path for imports
TELEGRAM_BOT_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'telegram-bot')
sys.path.insert(0, TELEGRAM_BOT_PATH)


class TestCrypto:
    """Tests for crypto module."""

    @pytest.fixture(autouse=True)
    def setup_env(self):
        """Set up test environment variables."""
        # Store original values
        orig_enc_key = os.environ.get('TELEGRAM_ENCRYPTION_KEY')
        orig_jwt = os.environ.get('JWT_SECRET')

        os.environ['TELEGRAM_ENCRYPTION_KEY'] = 'test-encryption-key-32-bytes!!'
        os.environ['JWT_SECRET'] = 'test-jwt-secret'

        yield

        # Restore original values
        if orig_enc_key is not None:
            os.environ['TELEGRAM_ENCRYPTION_KEY'] = orig_enc_key
        elif 'TELEGRAM_ENCRYPTION_KEY' in os.environ:
            del os.environ['TELEGRAM_ENCRYPTION_KEY']

        if orig_jwt is not None:
            os.environ['JWT_SECRET'] = orig_jwt
        elif 'JWT_SECRET' in os.environ:
            del os.environ['JWT_SECRET']

    def test_get_encryption_key_from_env(self):
        """Test getting encryption key from environment."""
        try:
            from security.crypto import get_encryption_key
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        # Need to also mock Config
        with patch('security.crypto.Config') as mock_config:
            mock_config.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
            key = get_encryption_key()
            assert len(key) == 32

    def test_get_encryption_key_short_derives(self):
        """Test short key is derived via SHA-256."""
        try:
            from security.crypto import get_encryption_key
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with patch('security.crypto.Config') as mock_config:
            mock_config.ENCRYPTION_KEY = 'short'
            key = get_encryption_key()
            assert len(key) == 32

    def test_get_encryption_key_fallback_jwt(self):
        """Test fallback to JWT_SECRET."""
        try:
            from security.crypto import get_encryption_key
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with patch('security.crypto.Config') as mock_config:
            mock_config.ENCRYPTION_KEY = ''
            with patch.dict(os.environ, {'JWT_SECRET': 'test-jwt-secret-key'}):
                key = get_encryption_key()
                assert len(key) == 32

    def test_get_encryption_key_no_key_raises(self):
        """Test missing keys raises ValueError."""
        try:
            from security.crypto import get_encryption_key
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with patch('security.crypto.Config') as mock_config:
            mock_config.ENCRYPTION_KEY = ''
            with patch.dict(os.environ, {}, clear=True):
                # Remove JWT_SECRET from env
                if 'JWT_SECRET' in os.environ:
                    del os.environ['JWT_SECRET']
                with pytest.raises(ValueError, match='No encryption key'):
                    get_encryption_key()

    def test_encrypt_decrypt_roundtrip(self):
        """Test encrypt/decrypt roundtrip."""
        try:
            from security.crypto import encrypt, decrypt
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with patch('security.crypto.Config') as mock_config:
            mock_config.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'

            plaintext = 'sk-ant-test-api-key-12345'
            encrypted = encrypt(plaintext)

            assert encrypted.encrypted != plaintext.encode()
            assert len(encrypted.iv) == 32  # hex encoded 16 bytes
            assert len(encrypted.auth_tag) == 32  # hex encoded 16 bytes

            decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.auth_tag,
            )
            assert decrypted == plaintext

    def test_encrypt_empty_raises(self):
        """Test encrypting empty string raises."""
        try:
            from security.crypto import encrypt
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with pytest.raises(ValueError, match='non-empty string'):
            encrypt('')

        with pytest.raises(ValueError, match='non-empty string'):
            encrypt(None)

    def test_decrypt_missing_params_raises(self):
        """Test decrypting with missing params raises."""
        try:
            from security.crypto import decrypt
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with pytest.raises(ValueError, match='Missing required'):
            decrypt(None, 'iv', 'tag')

        with pytest.raises(ValueError, match='Missing required'):
            decrypt(b'data', '', 'tag')

    def test_encrypt_different_each_time(self):
        """Test encryption produces different ciphertext each time."""
        try:
            from security.crypto import encrypt
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        with patch('security.crypto.Config') as mock_config:
            mock_config.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'

            plaintext = 'test-key'
            enc1 = encrypt(plaintext)
            enc2 = encrypt(plaintext)

            # IV should be different
            assert enc1.iv != enc2.iv
            # Ciphertext should be different
            assert enc1.encrypted != enc2.encrypted

    def test_mask_key_short(self):
        """Test masking short key."""
        try:
            from security.crypto import mask_key
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        assert mask_key('') == '****'
        assert mask_key('abc') == '****'

    def test_mask_key_normal(self):
        """Test masking normal key."""
        try:
            from security.crypto import mask_key
        except ImportError:
            pytest.skip('Crypto dependencies not available')

        result = mask_key('sk-ant-api-key-12345')
        assert result == '****2345'
        assert 'sk-ant' not in result


class TestApiKeyValidation:
    """Tests for API key format validation."""

    def test_validate_claude_key(self):
        """Test Claude key validation."""
        try:
            from commands.apikey import _validate_key_format
        except ImportError:
            pytest.skip('Command dependencies not available')

        assert _validate_key_format('claude', 'sk-ant-valid-key') is True
        assert _validate_key_format('claude', 'invalid-key') is False
        assert _validate_key_format('claude', 'sk-openai-key') is False

    def test_validate_openai_key(self):
        """Test OpenAI key validation."""
        try:
            from commands.apikey import _validate_key_format
        except ImportError:
            pytest.skip('Command dependencies not available')

        assert _validate_key_format('openai', 'sk-valid-key-12345') is True
        assert _validate_key_format('openai', 'invalid') is False

    def test_validate_short_key(self):
        """Test short key fails validation."""
        try:
            from commands.apikey import _validate_key_format
        except ImportError:
            pytest.skip('Command dependencies not available')

        assert _validate_key_format('claude', 'short') is False
        assert _validate_key_format('openai', 'abc') is False

    def test_validate_unknown_provider(self):
        """Test unknown provider passes basic check."""
        try:
            from commands.apikey import _validate_key_format
        except ImportError:
            pytest.skip('Command dependencies not available')

        # Unknown provider should just check length
        assert _validate_key_format('unknown', 'verylongkey123') is True
        assert _validate_key_format('unknown', 'short') is False
