#!/usr/bin/env bash
# Runs the submission gate on this checkout the way a fresh clone sees it:
# no .env, no credentials, nothing signed on testnet. Stops at the first failing step.
# Usage: yarn gate   (or: bash scripts/gate-check.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# A shell that already exports these would build and test a different app
# from the one a fresh clone gets, so the gate drops them for its own run.
unset HEDERA_OPERATOR_ID HEDERA_OPERATOR_PRIVATE_KEY HEDERA_NETWORK HEDERA_COUNCIL_ACCOUNT_ID
for name in $(compgen -e | grep -E '^NEXT_PUBLIC_' || true); do unset "$name"; done

# Public 32-byte values that look like keys. Add one only with a comment saying what it is.
ALLOWED_HEX="
b09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1 keccak256(\"PROPOSER_ROLE\")
360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc EIP-1967 implementation slot
ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 Hardhat's published local-node account #0
a5ee027700a30b404b7d0255b2a39efc376f332b4d09e682fe191308b48cea36 testnet transaction hash
4c792dedb1ce8721e80a558252c69ba8351bd4c5756b7a868bebbde4ca28afe3 testnet transaction hash
"

STEP_NAMES=()
STEP_RESULTS=()
STEP_SECONDS=()

print_summary() {
  local i
  printf '\n%-22s · %-6s · %s\n' "Step" "Result" "seconds"
  for ((i = 0; i < ${#STEP_NAMES[@]}; i++)); do
    printf '%-22s · %-6s · %s\n' "${STEP_NAMES[$i]}" "${STEP_RESULTS[$i]}" "${STEP_SECONDS[$i]}"
  done
}

run_step() {
  local name="$1"
  shift
  local started=$SECONDS status=0
  printf '\n==> %s\n' "$name"
  "$@" || status=$?
  STEP_NAMES+=("$name")
  STEP_SECONDS+=($((SECONDS - started)))
  if [ "$status" -ne 0 ]; then
    STEP_RESULTS+=("FAIL")
    print_summary
    printf '\nGATE FAILED at "%s" (exit %s)\n' "$name" "$status" >&2
    exit 1
  fi
  STEP_RESULTS+=("pass")
}

check_no_env_files() {
  # Refuse rather than move them aside: the gate never touches a developer's secrets,
  # and an interrupted run could leave them moved.
  local found
  found="$(find . packages/* -maxdepth 1 -name '.env*' ! -name '.env.example' 2>/dev/null | sort -u)"
  if [ -n "$found" ]; then
    printf 'Env files present; the gate must run as a fresh clone would. Run it from a clean clone:\n%s\n' "$found" >&2
    return 1
  fi
}

check_tracked_secrets() {
  local tracked hex_hits unexpected=""
  tracked="$(git ls-files | grep -E '(^|/)(\.env(\..*)?|setup-state\.json|chain-signer\.json|[^/]*\.(pem|key|p12))$' | grep -vE '(^|/)\.env\.example$' || true)"
  if [ -n "$tracked" ]; then
    printf 'Files that must never be committed are tracked:\n%s\n' "$tracked" >&2
    return 1
  fi

  # DER-encoded ED25519 / ECDSA private keys, and PEM private keys.
  if git grep -nIiE '302e020100300506032b6570|3030020100300706052b8104000a|BEGIN [A-Z ]*PRIVATE KEY' -- . ':!scripts/gate-check.sh'; then
    printf 'DER/PEM private key material in tracked files (above).\n' >&2
    return 1
  fi

  # Exactly 64 hex digits standing alone. ABI words (24+ leading zeros) are allowed: no key starts that way.
  hex_hits="$(git grep -hoIE '(^|[^0-9a-fA-F])(0x)?[0-9a-fA-F]{64}([^0-9a-fA-F]|$)' -- . ':!scripts/gate-check.sh' |
    grep -oE '[0-9a-fA-F]{64}' | tr 'A-F' 'a-f' | sort -u || true)"
  local value
  for value in $hex_hits; do
    case "$value" in 000000000000000000000000*) continue ;; esac
    if ! printf '%s\n' "$ALLOWED_HEX" | grep -q "^$value "; then
      unexpected="$unexpected $value"
    fi
  done
  if [ -n "$unexpected" ]; then
    printf 'Unexpected 64-hex values in tracked files (a private key?):\n' >&2
    for value in $unexpected; do git grep -nI "$value" -- . >&2 || true; done
    return 1
  fi
}

check_types() {
  yarn core:check-types && yarn agent:check-types && yarn next:check-types && yarn hardhat:check-types
}

run_step "no env files" check_no_env_files
run_step "secrets hygiene" check_tracked_secrets
run_step "install" yarn install --immutable
run_step "lint" yarn lint
run_step "compile contracts" yarn hardhat:compile
run_step "check-types" check_types
run_step "test" yarn test
run_step "next build" yarn next:build
run_step "harness validate" yarn hedera-harness validate

print_summary
printf '\nGATE PASSED\n'
