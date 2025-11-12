#!/usr/bin/env python3
"""
USB Update Monitor - Detects USB drives and processes .araupdate files
Runs as part of the self-healing agent
"""

import os
import sys
import time
import json
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from datetime import datetime

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
USB_MOUNT_BASE = '/media'  # Common USB mount point on Linux
UPDATES_DIR = '/arasul/updates/usb'
PROCESSED_UPDATES_FILE = '/arasul/updates/usb_processed.json'
CHECK_INTERVAL = 5  # Check for USB every 5 seconds
UPDATE_LOG_FILE = '/arasul/logs/update_usb.log'

# Ensure directories exist
os.makedirs(UPDATES_DIR, exist_ok=True)
os.makedirs(os.path.dirname(PROCESSED_UPDATES_FILE), exist_ok=True)
os.makedirs(os.path.dirname(UPDATE_LOG_FILE), exist_ok=True)


class USBMonitor:
    """Monitor USB drives for .araupdate files"""

    def __init__(self):
        self.processed_files = self._load_processed_files()
        self.last_mounted_devices = set()

    def _load_processed_files(self) -> Dict[str, str]:
        """Load list of already processed update files"""
        try:
            if os.path.exists(PROCESSED_UPDATES_FILE):
                with open(PROCESSED_UPDATES_FILE, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            logger.error(f"Failed to load processed files: {e}")
            return {}

    def _save_processed_file(self, filename: str, checksum: str):
        """Mark a file as processed"""
        try:
            self.processed_files[filename] = checksum
            with open(PROCESSED_UPDATES_FILE, 'w') as f:
                json.dump(self.processed_files, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save processed file: {e}")

    def get_mounted_usb_devices(self) -> List[str]:
        """Get list of currently mounted USB devices"""
        mounted_devices = []

        try:
            # Method 1: Check /proc/mounts
            with open('/proc/mounts', 'r') as f:
                for line in f:
                    parts = line.split()
                    if len(parts) < 2:
                        continue

                    mount_point = parts[1]

                    # Check if it's a USB device (typically in /media or /mnt)
                    if mount_point.startswith('/media/') or mount_point.startswith('/mnt/'):
                        # Verify it's actually a removable device
                        device = parts[0]
                        if self._is_removable_device(device):
                            mounted_devices.append(mount_point)

            # Method 2: Also check lsblk for additional USB devices
            try:
                result = subprocess.run(
                    ['lsblk', '-J', '-o', 'NAME,MOUNTPOINT,RM,TYPE'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )

                if result.returncode == 0:
                    lsblk_data = json.loads(result.stdout)
                    for device in lsblk_data.get('blockdevices', []):
                        if device.get('rm') == '1' and device.get('type') == 'part':
                            mount_point = device.get('mountpoint')
                            if mount_point and mount_point not in mounted_devices:
                                mounted_devices.append(mount_point)

            except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
                pass  # lsblk not available or failed

        except Exception as e:
            logger.error(f"Error getting mounted USB devices: {e}")

        return mounted_devices

    def _is_removable_device(self, device: str) -> bool:
        """Check if a device is removable (USB)"""
        try:
            # Extract device name (e.g., /dev/sdb1 -> sdb)
            device_name = device.replace('/dev/', '').rstrip('0123456789')

            # Check if removable
            removable_path = f"/sys/block/{device_name}/removable"
            if os.path.exists(removable_path):
                with open(removable_path, 'r') as f:
                    return f.read().strip() == '1'

        except Exception:
            pass

        return False

    def find_update_files(self, mount_point: str) -> List[Tuple[str, str]]:
        """Find .araupdate files on a mounted USB device"""
        update_files = []

        try:
            for root, dirs, files in os.walk(mount_point):
                for file in files:
                    if file.endswith('.araupdate'):
                        file_path = os.path.join(root, file)

                        # Check if we've already processed this file
                        checksum = self._calculate_checksum(file_path)
                        if checksum and file not in self.processed_files:
                            update_files.append((file_path, checksum))
                        elif checksum and self.processed_files.get(file) != checksum:
                            # Same filename but different checksum - new version
                            update_files.append((file_path, checksum))

        except Exception as e:
            logger.error(f"Error scanning {mount_point}: {e}")

        return update_files

    def _calculate_checksum(self, file_path: str) -> Optional[str]:
        """Calculate SHA256 checksum of a file"""
        try:
            import hashlib
            sha256 = hashlib.sha256()

            with open(file_path, 'rb') as f:
                while chunk := f.read(8192):
                    sha256.update(chunk)

            return sha256.hexdigest()

        except Exception as e:
            logger.error(f"Failed to calculate checksum for {file_path}: {e}")
            return None

    def copy_update_file(self, source_path: str, checksum: str) -> Optional[str]:
        """Copy update file to internal updates directory"""
        try:
            filename = os.path.basename(source_path)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            dest_filename = f"usb_{timestamp}_{filename}"
            dest_path = os.path.join(UPDATES_DIR, dest_filename)

            logger.info(f"Copying update file: {source_path} -> {dest_path}")

            # Copy file
            shutil.copy2(source_path, dest_path)

            # Copy signature file if it exists
            sig_source = f"{source_path}.sig"
            if os.path.exists(sig_source):
                sig_dest = f"{dest_path}.sig"
                shutil.copy2(sig_source, sig_dest)
                logger.info(f"Copied signature file: {sig_dest}")
            else:
                logger.warning(f"No signature file found for {filename}")

            # Verify copy
            dest_checksum = self._calculate_checksum(dest_path)
            if dest_checksum != checksum:
                logger.error("Checksum mismatch after copy!")
                os.remove(dest_path)
                return None

            logger.info(f"Update file copied successfully: {dest_path}")
            return dest_path

        except Exception as e:
            logger.error(f"Failed to copy update file: {e}")
            return None

    def validate_and_process_update(self, update_path: str, original_filename: str, checksum: str) -> bool:
        """Validate and trigger update installation"""
        try:
            logger.info(f"Validating update package: {update_path}")

            # Call validation via API
            import requests

            dashboard_backend_url = os.getenv('DASHBOARD_BACKEND_URL', 'http://dashboard-backend:3001')

            # First, get authentication token (we need admin credentials)
            # In production, this would use a service account or internal API key
            auth_response = requests.post(
                f"{dashboard_backend_url}/api/auth/login",
                json={
                    "username": "admin",
                    "password": os.getenv('ADMIN_PASSWORD', 'admin')  # Should be from env
                },
                timeout=10
            )

            if auth_response.status_code != 200:
                logger.error("Failed to authenticate with dashboard backend")
                return False

            token = auth_response.json().get('token')

            # Validate update package
            validation_response = requests.post(
                f"{dashboard_backend_url}/api/update/validate-file",
                json={"file_path": update_path},
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )

            if validation_response.status_code != 200:
                logger.error(f"Update validation failed: {validation_response.text}")
                return False

            validation_data = validation_response.json()
            logger.info(f"Update validated: {validation_data.get('version')}")

            # Trigger update application
            apply_response = requests.post(
                f"{dashboard_backend_url}/api/update/apply",
                json={"file_path": update_path},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )

            if apply_response.status_code == 200:
                logger.info("Update application started successfully")
                self._save_processed_file(original_filename, checksum)

                # Log to update log file
                self._log_update_event(original_filename, validation_data.get('version'), 'started')

                return True
            else:
                logger.error(f"Failed to start update: {apply_response.text}")
                return False

        except Exception as e:
            logger.error(f"Failed to process update: {e}")
            return False

    def _log_update_event(self, filename: str, version: str, status: str):
        """Log update event to USB update log file"""
        try:
            log_entry = {
                'timestamp': datetime.now().isoformat(),
                'filename': filename,
                'version': version,
                'status': status
            }

            with open(UPDATE_LOG_FILE, 'a') as f:
                f.write(json.dumps(log_entry) + '\n')

        except Exception as e:
            logger.error(f"Failed to log update event: {e}")

    def check_for_new_devices(self):
        """Check for newly mounted USB devices"""
        current_devices = set(self.get_mounted_usb_devices())

        # Detect newly mounted devices
        new_devices = current_devices - self.last_mounted_devices

        if new_devices:
            logger.info(f"New USB devices detected: {new_devices}")

            for mount_point in new_devices:
                self.scan_and_process_device(mount_point)

        self.last_mounted_devices = current_devices

    def scan_and_process_device(self, mount_point: str):
        """Scan a USB device and process any update files"""
        try:
            logger.info(f"Scanning USB device: {mount_point}")

            update_files = self.find_update_files(mount_point)

            if not update_files:
                logger.info(f"No new update files found on {mount_point}")
                return

            logger.info(f"Found {len(update_files)} update file(s) on {mount_point}")

            # Process each update file (latest version wins)
            for file_path, checksum in update_files:
                original_filename = os.path.basename(file_path)
                logger.info(f"Processing update: {original_filename}")

                # Copy to internal storage
                dest_path = self.copy_update_file(file_path, checksum)

                if dest_path:
                    # Validate and process
                    success = self.validate_and_process_update(dest_path, original_filename, checksum)

                    if success:
                        logger.info(f"Update processing initiated for {original_filename}")
                    else:
                        logger.error(f"Update processing failed for {original_filename}")

        except Exception as e:
            logger.error(f"Error processing device {mount_point}: {e}")

    def run(self):
        """Main monitoring loop"""
        logger.info("USB Update Monitor started")
        logger.info(f"Monitoring for .araupdate files on USB devices...")
        logger.info(f"Updates will be copied to: {UPDATES_DIR}")

        while True:
            try:
                self.check_for_new_devices()
                time.sleep(CHECK_INTERVAL)

            except KeyboardInterrupt:
                logger.info("USB Monitor stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(CHECK_INTERVAL)


def main():
    """Entry point"""
    monitor = USBMonitor()
    monitor.run()


if __name__ == '__main__':
    main()
