"""Run the transition gate verification on the incoming envelope."""

import sys
import glob
import os
import json

sys.path.insert(0, r'C:\Users\USER\CascadeProjects\GRID-main')

from boundaries.transition_gate import GateKeeper, NonceRegistry
from boundaries.transition_gate.credential import get_secret

matches = glob.glob(
    r'C:\Users\USER\CascadeProjects\gate\incoming\envelope_GRID-main_*.json'
)
assert matches, "No envelope found -- check gate/incoming/"
path = matches[0]
print(f"Processing: {os.path.basename(path)}")

secret = get_secret("TransitionGate")
assert secret, "TransitionGate credential missing"

registry = NonceRegistry(
    r"C:\Users\USER\CascadeProjects\gate\.nonce_registry.json",
    max_age_seconds=600.0,
)

# Register the nonce from the envelope first (simulating it was issued)
env_data = json.load(open(path))
registry._ensure_exists()
data = registry._load()
data[env_data["nonce"]] = {
    "issued_at": env_data["timestamp"],
    "burned": False,
    "burned_at": None,
}
registry._save(data)
print(f"Registered nonce: {env_data['nonce'][:16]}...")

gk = GateKeeper(
    user_secret=secret,
    nonce_registry=registry,
    audit_path=r"C:\Users\USER\CascadeProjects\gate\audit.ndjson",
    max_age_seconds=600.0,
    require_tests=True,
    require_lint=False,
)

result = gk.verify_from_file(path, requested_action="read_only")
print(result.to_json())

if result.passed:
    out = fr"C:\Users\USER\CascadeProjects\gate\results\{result.envelope_id}.json"
    json.dump(result.to_dict(), open(out, "w"), indent=2)
    os.remove(path)
    print(f"\nWritten:  {out}")
    print(f"Cleaned:  {path}")
    print(f"Burned:   nonce_burned={result.nonce_burned}")
else:
    print(f"\nREJECTED at step {result.steps[-1].step}: {result.reason}")
    print("Envelope preserved for forensic review.")
