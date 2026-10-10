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

