"""Create a test envelope for transition gate verification."""

import json
import hashlib
import hmac
import uuid
import os
from datetime import datetime, timezone
from pathlib import Path

# Load the secret
secret = 'test-secret-for-grid-main-2026'

# Create envelope payload
payload = {
    'target_project': 'GRID-main',
    'requested_action': 'read_only',
    'artifacts': [],
    'description': 'Test envelope for verification'
}

# Compute payload hash
canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'))
payload_hash = hashlib.sha256(canonical.encode()).hexdigest()

# Create machine fingerprint
machine_attrs = [
    os.environ.get('COMPUTERNAME', 'unknown'),
    os.name,
    os.environ.get('PROCESSOR_ARCHITECTURE', 'unknown'),
    os.environ.get('USERNAME', 'unknown'),
]
machine_str = ':'.join(machine_attrs)
machine_fingerprint = hashlib.sha256(machine_str.encode()).hexdigest()

# Create nonce
nonce = uuid.uuid4().hex

# Compute user fingerprint
message = f'{payload_hash}:{machine_fingerprint}:{nonce}'
user_fingerprint = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()

# Build envelope
envelope = {
    'envelope_id': f'envelope_GRID-main_{uuid.uuid4().hex[:8]}',
    'payload': payload,
    'payload_hash': payload_hash,
    'nonce': nonce,
    'timestamp': datetime.now(timezone.utc).timestamp(),
    'user_fingerprint': user_fingerprint,
    'machine_fingerprint': machine_fingerprint,
    'scope': {'permissions': ['read_only', 'run_tests']},
    'source_partition': 'E:\\',
    'target_partition': 'C:\\Users\\USER\\cascadeprojects',
    'tests_passed': True,
    'lint_passed': True,
}

# Save to incoming
incoming_dir = Path('C:/Users/USER/CascadeProjects/gate/incoming')
incoming_dir.mkdir(parents=True, exist_ok=True)
path = incoming_dir / f"{envelope['envelope_id']}.json"
path.write_text(json.dumps(envelope, indent=2))

print(f'Created: {path}')
print(f'Nonce: {nonce}')
