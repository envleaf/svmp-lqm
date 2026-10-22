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

install_dependencies() {
    echo "Checking and installing required system dependencies..."

    SUDO=""
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        fi
    fi

    if command -v pacman >/dev/null 2>&1; then
        echo "Detected Arch Linux (pacman)."
        $SUDO pacman -Sy --needed --noconfirm \
            gstreamer \
            gst-plugins-base \
            gst-plugins-good \
            gst-plugins-bad \
            gst-plugins-ugly \
            gtk3 \
            webkit2gtk \
            pkgconf \
            go || true
    elif command -v apt-get >/dev/null 2>&1; then
        echo "Detected Debian/Ubuntu (apt-get)."
        $SUDO apt-get update -y || true
        $SUDO apt-get install -y \
            libgstreamer1.0-0 \
            gstreamer1.0-plugins-base \
            gstreamer1.0-plugins-good \
            gstreamer1.0-plugins-bad \
            gstreamer1.0-plugins-ugly \
            gstreamer1.0-alsa \
            gstreamer1.0-pulseaudio \
            libgtk-3-dev \
            libwebkit2gtk-4.0-dev \
            pkg-config \
            golang || true
    elif command -v dnf >/dev/null 2>&1; then
        echo "Detected Fedora/RHEL (dnf)."
        $SUDO dnf install -y \
            gstreamer1 \
            gstreamer1-plugins-base \
            gstreamer1-plugins-good \
            gstreamer1-plugins-bad-free \
            gstreamer1-plugins-ugly-free \
            gtk3-devel \
            webkit2gtk3-devel \
            pkgconfig \
            golang || true
    elif command -v zypper >/dev/null 2>&1; then
        echo "Detected openSUSE (zypper)."
        $SUDO zypper install -y \
            gstreamer \
            gstreamer-plugins-base \
            gstreamer-plugins-good \
            gstreamer-plugins-bad \
            gstreamer-plugins-ugly \
            gtk3-devel \
            webkit2gtk3-devel \
            pkg-config \
            go || true
    else
        echo "Warning: Unrecognized package manager. Please ensure GStreamer (with gst-plugins-good), GTK3, and WebKit2GTK are installed on your system."
    fi
}

read -p "Would you like to install svmp-lqm $VERSION and its dependencies? [Y/n] " response

# Default to Y if user hits Enter, or check if response matches [Yy]*
response="${response:-Y}"

case "$response" in
    [Yy]*)
        install_dependencies
        echo "Compiling svmp-lqm..."
        PKG_CONFIG_PATH="$HOME/.local/lib/pkgconfig" go build -o svmp-lqm .
        echo "Successfully installed svmp-lqm $VERSION."
        ;;
    *)
        echo "Installation canceled."
        exit 0
        ;;
esac
