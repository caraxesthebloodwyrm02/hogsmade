"""Debug fingerprint mismatch."""

import json
import hashlib
import hmac

# Load envelope
env = json.load(open(r'C:\Users\USER\CascadeProjects\gate\incoming\envelope_GRID-main_2026-03-07_224555.json'))

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

# Try different secrets to find match
secrets_to_try = [
    'test-secret-for-grid-main-2026',
    'grid-main-secret',
    'TransitionGate',
    'test-secret',
    'secret',
    'GRID-main-2026',
]

for secret in secrets_to_try:
    message = f"{env['payload_hash']}:{env['machine_fingerprint']}:{env['nonce']}"
    computed = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    match = computed == env['user_fingerprint']
    print(f'Secret "{secret}": {computed[:32]}... match={match}')
