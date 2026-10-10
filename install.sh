#!/usr/bin/env bash

set -e

# Find directory where install.sh is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Parse version from AGENTS.md
VERSION=$(grep -oP 'Current Version:\s*\K[0-9.]+' AGENTS.md 2>/dev/null || grep 'Current Version:' AGENTS.md | sed -E 's/.*Current Version:[[:space:]]*([0-9.]+).*/\1/')

if [ -z "$VERSION" ]; then
    VERSION="0.0.47"
fi

echo "SvMP (LQM) Installer"
read -p "Would you like to install svmp-lqm $VERSION? [Y/n] " response

# Default to Y if user hits Enter, or check if response matches [Yy]*
response="${response:-Y}"

case "$response" in
    [Yy]*)
        echo "Compiling svmp-lqm..."
        PKG_CONFIG_PATH="$HOME/.local/lib/pkgconfig" go build -o svmp-lqm .
        echo "Successfully installed svmp-lqm $VERSION."
        ;;
    *)
        echo "Installation canceled."
        exit 0
        ;;
esac
