"""Debug fingerprint mismatch."""

import json
import hashlib
import hmac
import os
from pathlib import Path

# Secret must come from environment (never commit or enumerate test secrets).
# Set TRANSITION_GATE_TEST_SECRET to the secret you use for local test envelopes.
secret = os.environ.get("TRANSITION_GATE_TEST_SECRET")
if not secret:
    raise SystemExit(
        "TRANSITION_GATE_TEST_SECRET is not set. Set it to the secret used when creating the test envelope."
    )

# GATE dir at workspace root
root = Path(__file__).resolve().parents[2]
gate_incoming = root / 'GATE' / 'incoming'
candidates = list(gate_incoming.glob('envelope_GRID-main_*.json'))
assert candidates, f"No envelope found in {gate_incoming}"
path = candidates[0]
env = json.loads(path.read_text())

print('Envelope ID:', env['envelope_id'])
print('Source partition:', env.get('source_partition'))
print('Target partition:', env.get('target_partition'))
print('Tests passed:', env.get('tests_passed'))
print('Lint passed:', env.get('lint_passed'))
print()
print('Payload hash (envelope):', env['payload_hash'])
print('Machine fingerprint (envelope):', env['machine_fingerprint'])
print('Nonce:', env['nonce'])
print('User fingerprint (envelope):', env['user_fingerprint'])
print()

message = f"{env['payload_hash']}:{env['machine_fingerprint']}:{env['nonce']}"
computed = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
match = computed == env['user_fingerprint']
print(f'Computed fingerprint: {computed[:32]}... match={match}')
