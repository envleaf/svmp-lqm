#!/usr/bin/env bash

set -e

# Find directory where installer.sh is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Parse version from AGENTS.md
VERSION=$(grep -oP 'Current Version:\s*\K[0-9.]+' AGENTS.md 2>/dev/null || grep 'Current Version:' AGENTS.md | sed -E 's/.*Current Version:[[:space:]]*([0-9.]+).*/\1/')

if [ -z "$VERSION" ]; then
    VERSION="0.0.47"
fi

INSTALL_DIR="$HOME/.config/svmp-lqm"
DESKTOP_FILE="$HOME/.local/share/applications/svmp-lqm.desktop"
BIN_LINK="$HOME/.local/bin/svmp-lqm"

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
            webkit2gtk-4.1 \
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
            libwebkit2gtk-4.1-dev \
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
            webkit2gtk4.1-devel \
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

    # Fix for WebKit2GTK pkg-config mapping if webkit2gtk-4.0.pc is missing but 4.1 exists
    if ! pkg-config --exists webkit2gtk-4.0 2>/dev/null && pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
        mkdir -p "$HOME/.local/lib/pkgconfig"
        PC_PATH=$(pkg-config --variable=pcfiledir webkit2gtk-4.1 2>/dev/null || echo "/usr/lib/x86_64-linux-gnu/pkgconfig")
        if [ -f "$PC_PATH/webkit2gtk-4.1.pc" ]; then
            cp "$PC_PATH/webkit2gtk-4.1.pc" "$HOME/.local/lib/pkgconfig/webkit2gtk-4.0.pc"
        fi
    fi
}

do_compile() {
    install_dependencies
    echo "Compiling svmp-lqm..."
    PKG_CONFIG_PATH="$HOME/.local/lib/pkgconfig:$PKG_CONFIG_PATH" go build -o svmp-lqm .
}

do_install() {
    do_compile
    echo "Installing svmp-lqm $VERSION to $INSTALL_DIR..."

    mkdir -p "$INSTALL_DIR"
    mkdir -p "$HOME/.local/share/applications"
    mkdir -p "$HOME/.local/bin"

    # Move binary and assets to ~/.config/svmp-lqm
    cp -f svmp-lqm "$INSTALL_DIR/"
    cp -f player.html "$INSTALL_DIR/" 2>/dev/null || true
    cp -f *.js "$INSTALL_DIR/" 2>/dev/null || true
    cp -f *.css "$INSTALL_DIR/" 2>/dev/null || true
    cp -f *.png "$INSTALL_DIR/" 2>/dev/null || true

    # Move config if present locally or preserve existing config
    if [ -f "svmp-lqm.conf" ] && [ ! -f "$INSTALL_DIR/svmp-lqm.conf" ]; then
        cp -f svmp-lqm.conf "$INSTALL_DIR/"
    fi

    # Symlink binary to ~/.local/bin/svmp-lqm
    ln -sf "$INSTALL_DIR/svmp-lqm" "$BIN_LINK"

    # Create desktop launcher for KDE / Desktop environment integration
    cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Type=Application
Name=SVMP (LQM)
Comment=Local music player
Exec=$INSTALL_DIR/svmp-lqm
Icon=$INSTALL_DIR/svmp-lqm.png
Terminal=false
Categories=AudioVideo;Audio;Player;Music;
StartupWMClass=svmp-lqm
EOF

    chmod +x "$DESKTOP_FILE"

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    fi

    echo "Successfully installed / updated svmp-lqm $VERSION."
    echo "Launcher created at $BIN_LINK"
    echo "Desktop application entry created at $DESKTOP_FILE"
}

do_delete() {
    echo "Removing svmp-lqm completely from the system..."

    rm -rf "$INSTALL_DIR"
    rm -f "$DESKTOP_FILE"
    rm -f "$BIN_LINK"

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    fi

    echo "svmp-lqm has been completely removed from the system."
}

echo "=========================================="
echo "    SvMP (LQM) Installer v$VERSION"
echo "=========================================="
echo "Please select an option:"
echo "  1) Install / Update (Install to system at ~/.config/svmp-lqm with desktop icon)"
echo "  2) Compile (Compile binary locally in current directory)"
echo "  3) Delete (Remove svmp-lqm completely from the system)"
echo "  4) Cancel"
echo "=========================================="

read -p "Enter choice [1-4]: " choice

case "$choice" in
    1)
        do_install
        ;;
    2)
        do_compile
        echo "Successfully compiled svmp-lqm $VERSION in current directory."
        ;;
    3)
        read -p "Are you sure you want to COMPLETELY remove svmp-lqm from your system? [y/N] " confirm
        case "$confirm" in
            [Yy]*)
                do_delete
                ;;
            *)
                echo "Deletion canceled."
                ;;
        esac
        ;;
    *)
        echo "Operation canceled."
        exit 0
        ;;
esac
