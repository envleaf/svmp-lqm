# Core Directives

This repository contains a local-only music player.

## Untouchable Features

The following features are critical and MUST NOT be broken, altered, or removed during any refactoring or feature additions:

- Search Functionality: The `executeSearch` logic and listeners must remain fully functional.

- Synced Lyrics: The `fetchLyrics` and `updateLyricsScroll` functions (which fetch from `lrclib.net`) must be preserved exactly as they are.

- EQ Controls: The UI and click listeners for the equalizer (`\[\<\]` and `\[\>\]` buttons) must remain interactable.

- Visual FX & Backgrounds: All ASCII background animations and `fx-box` menu toggles must be maintained. Do not use simplified fallbacks.

- Other buttons: All buttons must maintain full functionality.

- Ignore anything in the ARCHIVE folder

## Versioning Instructions for Agents

<!-- AGENT VERSIONING COMMENT
Current Version: 0.0.55
Current Branch Tag: nightly-lqm

Rules for Updating Versioning:
1. Version format is MAJOR.MINOR.PATCH (e.g., 0.0.47).
2. Automatically increase the patch version by one for every single commit.
3. Starting version is 0.0.46 with branch tag "nightly-lqm".
3. When the MINOR patch version increases (the second position in 0.0.0, e.g., from 0.0.x to 0.1.x), automatically update the branch tag from "nightly-lqm" to "release-lqm".
4. The "LQM" suffix (-lqm) should NEVER be modified unless explicitly instructed.
5. Note: The source repo being pulled from is envleaf/svmp, NOT envleaf/svmp-lqm.
6. Always reflect version and branch tag updates in player.html inside the keybind modal:
   Format: svmp-lqm <VERSION> (<BRANCH-TAG>)
-->
