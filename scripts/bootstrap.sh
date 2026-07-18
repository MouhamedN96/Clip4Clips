#!/bin/bash
# ============================================
# ClipForge Bootstrap
# ============================================
# Turns a fresh clone into a deploy-ready instance:
#   1. creates config/.env from the template
#   2. auto-generates strong secrets (no hand-editing passwords)
#   3. sets the white-label brand name / domain
# After this, paste your API keys into config/.env and run scripts/deploy.sh.
#
# Non-interactive use (e.g. white-label provisioning):
#   BRAND_NAME="Acme Clips" BRAND_DOMAIN="https://acme.com" ./scripts/bootstrap.sh --yes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/config/.env"
ENV_EXAMPLE="$PROJECT_DIR/config/.env.example"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
step() { echo -e "${GREEN}[BOOTSTRAP]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

# Strong random secret, with a fallback if openssl is missing.
gen() {
    openssl rand -hex 24 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 40
}

# Replace KEY=... in the env file (portable sed for GNU + BSD).
set_env() {
    local key="$1" val="$2"
    # Escape sed-special chars in the value.
    local esc; esc=$(printf '%s' "$val" | sed -e 's/[&/\|]/\\&/g')
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i.bak "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
        echo "${key}=${val}" >> "$ENV_FILE"
    fi
}

if [ -f "$ENV_FILE" ]; then
    warn "config/.env already exists — not overwriting. Delete it first to re-bootstrap."
    exit 0
fi

step "Creating config/.env from template..."
cp "$ENV_EXAMPLE" "$ENV_FILE"

step "Generating secrets..."
set_env "API_SECRET" "$(gen)"
set_env "POSTGRES_PASSWORD" "$(gen)"
set_env "REDIS_PASSWORD" "$(gen)"

# Branding: from env vars, or prompt, or defaults.
if [ "$1" != "--yes" ] && [ -t 0 ]; then
    read -rp "Brand name [${BRAND_NAME:-ClipForge}]: " _bn; BRAND_NAME="${_bn:-${BRAND_NAME:-ClipForge}}"
    read -rp "Brand domain [${BRAND_DOMAIN:-https://your-domain.com}]: " _bd; BRAND_DOMAIN="${_bd:-${BRAND_DOMAIN:-https://your-domain.com}}"
fi
BRAND_NAME="${BRAND_NAME:-ClipForge}"
BRAND_DOMAIN="${BRAND_DOMAIN:-https://your-domain.com}"

step "Setting brand: ${BRAND_NAME} (${BRAND_DOMAIN})"
set_env "BRAND_NAME" "$BRAND_NAME"
set_env "BRAND_DOMAIN" "$BRAND_DOMAIN"
set_env "DOMAIN" "$BRAND_DOMAIN"

echo ""
step "Done. config/.env is ready with secrets + branding filled in."
echo ""
echo "Next:"
echo "  1. Paste your API keys into config/.env (WHOP_*, DEEPSEEK_*, HERMES_*, etc.)"
echo "     Everything else is optional — unset keys just disable that feature, nothing crashes."
echo "  2. Run: ./scripts/deploy.sh"
echo ""
