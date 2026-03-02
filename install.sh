#!/usr/bin/env bash
# Clink installer — curl -fsSL https://raw.githubusercontent.com/meitianwang/clink/main/install.sh | bash
set -euo pipefail

CLINK_DIR="${CLINK_INSTALL_DIR:-$HOME/.clink/app}"
REPO_URL="${CLINK_REPO:-https://github.com/meitianwang/clink.git}"

# ── Colors ──────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BOLD}$*${NC}"; }
ok()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${YELLOW}!${NC} $*"; }
fail()  { echo -e "  ${RED}✗${NC} $*"; exit 1; }

OS="$(uname -s)"

# ── Helper: detect package manager ─────────
install_pkg() {
    local pkg="$1"
    info "  Installing $pkg ..."
    if [ "$OS" = "Darwin" ]; then
        if ! command -v brew &>/dev/null; then
            info "  Homebrew not found, installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # Add brew to PATH for this session
            if [ -f /opt/homebrew/bin/brew ]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [ -f /usr/local/bin/brew ]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi
        fi
        brew install "$pkg"
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg"
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y -q "$pkg"
    elif command -v yum &>/dev/null; then
        sudo yum install -y -q "$pkg"
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm "$pkg"
    else
        fail "No supported package manager found. Please install $pkg manually."
    fi
}

# ── Prerequisites ───────────────────────────
info "\n── Clink Installer ──────────────────────\n"

# ── 1. Git ──────────────────────────────────
if command -v git &>/dev/null; then
    ok "git"
else
    warn "git not found, installing..."
    install_pkg git
    command -v git &>/dev/null || fail "git installation failed"
    ok "git installed"
fi

# ── 2. Python >= 3.10 ──────────────────────
find_python() {
    # Try versioned commands first (highest to lowest), then generic
    for cmd in python3.13 python3.12 python3.11 python3.10 python3 python; do
        if command -v "$cmd" &>/dev/null; then
            local major minor
            major=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null) || continue
            minor=$("$cmd" -c "import sys; print(sys.version_info.minor)" 2>/dev/null) || continue
            if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    # Check Homebrew paths directly (macOS)
    for p in /opt/homebrew/bin/python3 /usr/local/bin/python3; do
        if [ -x "$p" ]; then
            local major minor
            major=$("$p" -c "import sys; print(sys.version_info.major)" 2>/dev/null) || continue
            minor=$("$p" -c "import sys; print(sys.version_info.minor)" 2>/dev/null) || continue
            if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
                echo "$p"
                return 0
            fi
        fi
    done
    return 1
}

PY=""
if PY=$(find_python); then
    PY_VERSION=$($PY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
    ok "Python $PY_VERSION ($PY)"
else
    warn "Python >= 3.10 not found, installing..."
    if [ "$OS" = "Darwin" ]; then
        install_pkg python@3.13
    elif command -v apt-get &>/dev/null; then
        # Debian/Ubuntu: try python3.12 or python3.11
        sudo apt-get update -qq
        if apt-cache show python3.12 &>/dev/null; then
            sudo apt-get install -y -qq python3.12 python3.12-venv
        elif apt-cache show python3.11 &>/dev/null; then
            sudo apt-get install -y -qq python3.11 python3.11-venv
        else
            # Use deadsnakes PPA
            sudo apt-get install -y -qq software-properties-common
            sudo add-apt-repository -y ppa:deadsnakes/ppa
            sudo apt-get update -qq
            sudo apt-get install -y -qq python3.12 python3.12-venv
        fi
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y -q python3.12
    elif command -v yum &>/dev/null; then
        sudo yum install -y -q python3.11
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm python
    else
        fail "Cannot auto-install Python. Please install Python 3.10+ manually."
    fi

    # Re-find after install
    if PY=$(find_python); then
        PY_VERSION=$($PY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
        ok "Python $PY_VERSION installed ($PY)"
    else
        fail "Python installation failed. Please install Python 3.10+ manually."
    fi
fi

# ── 3. Node.js + Claude Code CLI ───────────
if command -v claude &>/dev/null; then
    ok "Claude Code CLI"
else
    warn "Claude Code CLI not found, installing..."
    if command -v npm &>/dev/null; then
        npm install -g @anthropic-ai/claude-code
    elif command -v node &>/dev/null; then
        # Node exists but npm missing (unusual)
        fail "Node.js found but npm missing. Run: npm i -g @anthropic-ai/claude-code"
    else
        info "  Node.js not found, installing..."
        if [ "$OS" = "Darwin" ]; then
            install_pkg node
        elif command -v apt-get &>/dev/null; then
            # Use NodeSource for recent Node.js
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y -qq nodejs
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y -q nodejs npm
        elif command -v yum &>/dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
            sudo yum install -y -q nodejs
        elif command -v pacman &>/dev/null; then
            sudo pacman -S --noconfirm nodejs npm
        else
            fail "Cannot auto-install Node.js. Please install Node.js and run: npm i -g @anthropic-ai/claude-code"
        fi
        npm install -g @anthropic-ai/claude-code
    fi
    if command -v claude &>/dev/null; then
        ok "Claude Code CLI installed"
    else
        warn "Claude Code CLI installation may need a terminal restart"
    fi
fi

# ── Clone / Update ──────────────────────────
info "\nInstalling Clink to $CLINK_DIR ...\n"

if [ -d "$CLINK_DIR/.git" ]; then
    info "Updating existing installation..."
    git -C "$CLINK_DIR" pull --ff-only
    ok "Updated"
else
    mkdir -p "$(dirname "$CLINK_DIR")"
    git clone --progress "$REPO_URL" "$CLINK_DIR"
    ok "Cloned"
fi

# ── Virtual environment ─────────────────────
VENV_DIR="$CLINK_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    info "  Creating virtual environment..."
    $PY -m venv "$VENV_DIR"
    ok "Created venv"
else
    ok "venv exists"
fi

info "\n  Installing Python dependencies...\n"
"$VENV_DIR/bin/pip" install --progress-bar on -r "$CLINK_DIR/requirements.txt"
echo ""
ok "Dependencies installed"

# ── Shell alias ─────────────────────────────
ALIAS_CMD="alias clink='$VENV_DIR/bin/python $CLINK_DIR/clink.py'"

# Detect shell config file
if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "${SHELL:-bash}")" = "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "${BASH_VERSION:-}" ] || [ "$(basename "${SHELL:-bash}")" = "bash" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC=""
fi

if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
    if ! grep -q "alias clink=" "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# Clink - Claude Code multi-channel wrapper" >> "$SHELL_RC"
        echo "$ALIAS_CMD" >> "$SHELL_RC"
        ok "Added 'clink' alias to $SHELL_RC"
    else
        ok "'clink' alias already in $SHELL_RC"
    fi
fi

# ── Run setup ───────────────────────────────
info "\n── Running Setup ────────────────────────\n"
"$VENV_DIR/bin/python" "$CLINK_DIR/clink.py" setup < /dev/tty

info "\n── Done! ────────────────────────────────"
echo ""
echo "  Restart your terminal, then:"
echo ""
echo "    clink start     # Start the bot"
echo "    clink doctor    # Check environment"
echo "    clink setup     # Re-configure"
echo ""
