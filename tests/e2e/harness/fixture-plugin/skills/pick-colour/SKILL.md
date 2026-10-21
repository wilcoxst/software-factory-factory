---
name: pick-colour
description: Test fixture for the e2e harness. Use when asked to pick a colour.
---

# Pick a colour

Follow these steps exactly, and do nothing else.

1. Ask the user with the AskUserQuestion tool: one question, header `Colour`, question "Which colour should we use?", options `Red (Recommended)` and `Blue`.
2. Write the chosen colour to `colour.txt` in the repo root, as one line without "(Recommended)".
3. Run `gh issue list --label factory --json number` and append a line `issues: <count>` to `colour.txt`, where `<count>` is the number of issues returned.
4. Create a branch `colour`, commit `colour.txt` with the message "Pick colour", and run `git push -u origin colour`.
5. Run `gh pr create --title "Colour choice" --body "Picked by the pick-colour skill."`.
