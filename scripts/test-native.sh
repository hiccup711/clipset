#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
qa_dir=$(mktemp -d /tmp/copyy-native.XXXXXX)
trap 'rm -rf "$qa_dir"' EXIT
clang -fobjc-arc -framework AppKit -framework ApplicationServices src-tauri/native/clipboard.m src-tauri/native/clipboard_test.m -o "$qa_dir/clipboard-test"
"$qa_dir/clipboard-test" src-tauri/icons/icon.png
