#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
qa_dir=$(mktemp -d /tmp/clipset-shortcuts.XXXXXX)
trap 'rm -rf "$qa_dir"' EXIT
clang -fobjc-arc -framework AppKit -framework ApplicationServices src-tauri/native/shortcuts_test.m -o "$qa_dir/shortcuts-test"
"$qa_dir/shortcuts-test"
