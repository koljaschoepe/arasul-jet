#!/usr/bin/env python3
"""
Signiert Arasul Update Package mit Private Key

Erstellt .araupdate File aus .tar.gz Package mit digitaler Signatur
für sichere Update-Verifikation im Arasul Platform System.
"""

import sys
import os

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.backends import default_backend
except ImportError:
    print("Error: cryptography library not found")
    print("Install with: pip3 install cryptography")
    sys.exit(1)


def sign_update_package(package_path, private_key_path):
    """
    Signiert Update Package und erstellt .araupdate File

    Args:
        package_path: Path to .tar.gz package
        private_key_path: Path to RSA private key (PEM format)

    Output:
        Creates .araupdate file with format:
        [original package data]
        \n---SIGNATURE---\n
        [RSA-PSS signature bytes]
    """

    if not os.path.exists(package_path):
        print(f"Error: Package not found: {package_path}")
        sys.exit(1)

    if not os.path.exists(private_key_path):
        print(f"Error: Private key not found: {private_key_path}")
        print("")
        print("Generate RSA key pair with:")
        print("  mkdir -p ~/.arasul")
        print("  openssl genrsa -out ~/.arasul/update_private_key.pem 4096")
        print("  openssl rsa -in ~/.arasul/update_private_key.pem -pubout -out ~/.arasul/update_public_key.pem")
        sys.exit(1)

    print(f"📖 Reading package: {package_path}")

    # Lade Private Key
    try:
        with open(private_key_path, "rb") as f:
            private_key = serialization.load_pem_private_key(
                f.read(),
                password=None,
                backend=default_backend()
            )
    except Exception as e:
        print(f"Error: Failed to load private key: {e}")
        sys.exit(1)

    # Lese Package
    try:
        with open(package_path, "rb") as f:
            package_data = f.read()
    except Exception as e:
        print(f"Error: Failed to read package: {e}")
        sys.exit(1)

    print(f"📦 Package size: {len(package_data)} bytes ({len(package_data) / 1024 / 1024:.2f} MB)")
    print(f"🔐 Signing with RSA-PSS (SHA-256)...")

    # Signiere mit RSA-PSS
    try:
        signature = private_key.sign(
            package_data,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
    except Exception as e:
        print(f"Error: Failed to sign package: {e}")
        sys.exit(1)

    # Erstelle .araupdate File (package + separator + signature)
    output_path = package_path.replace(".tar.gz", ".araupdate")

    try:
        with open(output_path, "wb") as f:
            f.write(package_data)
            f.write(b"\n---SIGNATURE---\n")
            f.write(signature)
    except Exception as e:
        print(f"Error: Failed to write signed package: {e}")
        sys.exit(1)

    print(f"✅ Package signed successfully")
    print(f"   Signature size: {len(signature)} bytes")
    print(f"   Total size: {len(package_data) + len(signature) + 16} bytes")
    print(f"   Output: {output_path}")

    # Cleanup original tar.gz
    try:
        os.remove(package_path)
        print(f"🗑️  Removed unsigned package: {package_path}")
    except Exception as e:
        print(f"Warning: Failed to remove original package: {e}")

    return output_path


def verify_signature(araupdate_path, public_key_path):
    """
    Verifiziert Signatur eines .araupdate Files (für Testing)

    Args:
        araupdate_path: Path to .araupdate file
        public_key_path: Path to RSA public key (PEM format)

    Returns:
        True if signature is valid, False otherwise
    """

    if not os.path.exists(araupdate_path):
        print(f"Error: Package not found: {araupdate_path}")
        return False

    if not os.path.exists(public_key_path):
        print(f"Error: Public key not found: {public_key_path}")
        return False

    # Load public key
    with open(public_key_path, "rb") as f:
        public_key = serialization.load_pem_public_key(
            f.read(),
            backend=default_backend()
        )

    # Read .araupdate file and split package/signature
    with open(araupdate_path, "rb") as f:
        content = f.read()

    separator = b"\n---SIGNATURE---\n"
    if separator not in content:
        print("Error: Invalid .araupdate format (missing signature separator)")
        return False

    parts = content.split(separator)
    if len(parts) != 2:
        print("Error: Invalid .araupdate format (multiple separators)")
        return False

    package_data = parts[0]
    signature = parts[1]

    print(f"📦 Package size: {len(package_data)} bytes")
    print(f"🔏 Signature size: {len(signature)} bytes")
    print(f"🔍 Verifying signature...")

    # Verify signature
    try:
        public_key.verify(
            signature,
            package_data,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        print("✅ Signature is VALID")
        return True
    except Exception as e:
        print(f"❌ Signature is INVALID: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) == 3:
        # Sign mode
        package_path = sys.argv[1]
        private_key_path = sys.argv[2]
        sign_update_package(package_path, private_key_path)
    elif len(sys.argv) == 4 and sys.argv[1] == "--verify":
        # Verify mode (for testing)
        araupdate_path = sys.argv[2]
        public_key_path = sys.argv[3]
        success = verify_signature(araupdate_path, public_key_path)
        sys.exit(0 if success else 1)
    else:
        print("Usage:")
        print("  Sign:   python3 sign_update_package.py <package.tar.gz> <private_key.pem>")
        print("  Verify: python3 sign_update_package.py --verify <package.araupdate> <public_key.pem>")
        sys.exit(1)
