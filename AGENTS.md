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
Current Nightly Version: v66-nightly
Current Stable Version: v1
Active Mode: nightly

Rules for Updating Versioning:
1. Version format is a simple incrementing counter:
   - For nightly builds: v<COUNTER>-nightly (e.g., v64-nightly). Automatically increase the nightly counter by 1 for every single commit.
   - For stable builds: v<COUNTER> (e.g., v1).
2. When tasked with making a "stable" update:
   - Remove the "-nightly" suffix and use the Current Stable Version (incrementing stable counter by 1 if making a new stable release).
   - Swap the UI display in src/player.html to reflect the stable version format (e.g., svmp-lqm v1).
3. The "LQM" suffix (-lqm) should NEVER be modified unless explicitly instructed.
4. Note: The repository being pulled from and checked for updates is envleaf/svmp-lqm.
5. Always reflect version updates in player.html inside the keybind modal (#keybind-modal):
   Format (nightly): svmp-lqm v64-nightly
   Format (stable): svmp-lqm v1
6. For every commit, update the patch notes modal (#patch-notes-modal) in src/player.html with a brief description of what changed in the new version along with the short git commit ID.
7. User configuration files (svmp-lqm.conf) and playlists directory (playlists/) MUST ALWAYS be preserved and NEVER overwritten during updates unless explicitly requested by an update task.
-->
