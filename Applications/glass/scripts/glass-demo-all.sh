#!/usr/bin/env bash
# Run all demonstration scripts sequentially

set -e

echo "Starting Glass Demonstrations..."
echo "Ensure Glass is running in another terminal: npm run dev"
echo ""

echo "--- Demo 1: Visual Feedback ---"
python3 scripts/demo-blocker-1-visual-feedback.py
echo ""

echo "--- Demo 2: Ceremony Milestones ---"
python3 scripts/demo-blocker-2-ceremony-milestones.py
echo ""

echo "--- Demo 3: Signal Modulation ---"
python3 scripts/demo-blocker-3-signal-modulation.py
echo ""

echo "--- Demo 4: Bidirectional Conversation ---"
python3 scripts/demo-blocker-4-bidirectional-conversation.py
echo ""

echo "All demonstrations complete!"
