#!/usr/bin/env python3
"""
Verify IDE Metrics & Binary Style Calculation
---------------------------------------------
Reads the SYSTEM-IDE-AMPLIFICATION.md doc and the current field-bridge.json
to calculate binary text stats, palette harmonics, and visual contrast schemas.
This verifies the "acoustic boost" and spatial density.
"""

import json
import math
import os
from pathlib import Path

# --- Palette Defs ---
PALETTE = {
    "void": "#0a0a0c",
    "surface": "#14141a",
    "amber": "#e8c9a0",
    "silver": "#8892b0",
    "gold": "#c4956a",
    "mythic": "#a0524a"
}

def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def relative_luminance(rgb: tuple[int, int, int]) -> float:
    # WCAG 2.0 relative luminance
    srgb = [v / 255.0 for v in rgb]
    lin = []
    for c in srgb:
        if c <= 0.03928:
            lin.append(c / 12.92)
        else:
            lin.append(((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]

def contrast_ratio(l1: float, l2: float) -> float:
    bright = max(l1, l2)
    dark = min(l1, l2)
    return (bright + 0.05) / (dark + 0.05)

def analyze_harmonics():
    print(f"\n[+] Analyzing Palette Harmonics & Acoustic Boosting")
    print(f"{'-'*60}")

    void_luma = relative_luminance(hex_to_rgb(PALETTE["void"]))
    print(f"{'Role':<15} | {'Hex':<10} | {'Luma':<8} | {'Contrast vs Void':<15} | {'Status'}")
    print(f"{'-'*60}")

    for name, hex_val in PALETTE.items():
        luma = relative_luminance(hex_to_rgb(hex_val))
        contrast = contrast_ratio(luma, void_luma)

        status = "BASE" if name == "void" else "PASS"
        if contrast > 7.0:
            status = "HIGH-SIG"
        elif contrast < 3.0 and name != "void" and name != "surface":
            status = "LOW-SIG"

        print(f"{name:<15} | {hex_val:<10} | {luma:<8.4f} | {contrast:>5.2f} : 1        | {status}")
    print(f"{'-'*60}")

def analyze_binary_style_and_metrics():
    print(f"\n[+] Binary Style Calculation & Metric Check")
    print(f"{'-'*60}")

    doc_path = Path("SYSTEM-IDE-AMPLIFICATION.md")
    if not doc_path.exists():
        print("ERROR: SYSTEM-IDE-AMPLIFICATION.md not found.")
        return

    raw_bytes = doc_path.stat().st_size
    text = doc_path.read_text(encoding="utf-8")
    word_count = len(text.split())

    # A rough "token" estimation for semantic tokens
    semantic_tokens = word_count * 1.3
    compression_ratio = raw_bytes / semantic_tokens if semantic_tokens else 0

    print(f"Target Doc        : {doc_path.name}")
    print(f"Raw Acoustic Bytes: {raw_bytes} bytes")
    print(f"Word Count        : {word_count}")
    print(f"Est. Tokens       : {semantic_tokens:.1f}")
    print(f"Compression (Cr)  : {compression_ratio:.2f} bytes/token")

    # Check live bridge density
    bridge_path = Path.home() / ".caraxes" / "field-bridge.json"
    if bridge_path.exists():
        try:
            bridge = json.loads(bridge_path.read_text())
            blocks = bridge.get("blocks", [])
            block_count = len(blocks)
            total_content_len = sum(len(b.get("content", "")) for b in blocks if isinstance(b, dict))

            print(f"\n[+] Caching Text Stats from Live Field")
            print(f"Active Blocks     : {block_count}")
            print(f"Total Block Bytes : {total_content_len}")

            if block_count > 0:
                density = (block_count * total_content_len) / 1000000.0 # arbitrary canvas area normalizer
                print(f"Spatial Density   : {density:.6f} (Blocks * Bytes / Area)")
                print(f"Harmonic Status   : {bridge.get('threshold_state', 'unknown').upper()}")
            else:
                print("Spatial Density   : 0 (Field is quiet)")

        except Exception as e:
            print(f"Failed to read bridge: {e}")
    else:
        print("\n[!] No active field-bridge.json found to calculate live density.")

if __name__ == "__main__":
    analyze_harmonics()
    analyze_binary_style_and_metrics()
    print("\n[+] Verification Complete. Surface ready for IDE amplification.\n")
