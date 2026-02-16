#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

say() {
  printf "%s\n" "$1"
}

run_or_print() {
  if [ "$DRY_RUN" -eq 1 ]; then
    say "[dry-run] $*"
  else
    say "[run] $*"
    eval "$@"
  fi
}

say "ClawPal MVP release assistant"
run_or_print "npm run typecheck"
run_or_print "npm run build"
run_or_print "cd src-tauri && cargo fmt --all --check"
run_or_print "cd src-tauri && cargo check"
run_or_print "cd src-tauri && cargo check --target-dir target/check"
run_or_print "cd src-tauri && cargo check"
run_or_print "cd src-tauri && cargo tauri build"
say "Done."
