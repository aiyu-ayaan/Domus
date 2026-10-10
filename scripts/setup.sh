#!/usr/bin/env bash
set -e

echo "=== Initializing Domus Development Environment ==="

# Check Node and pnpm
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is required. Please install pnpm."
    exit 1
fi

# Check Cargo
if ! command -v cargo &> /dev/null; then
    echo "Error: cargo is required. Please install Rust toolchain."
    exit 1
fi

echo "1. Installing Node dependencies..."
pnpm install

echo "2. Building Rust backend and crates..."
cargo check

echo "=== Domus environment ready! ==="
echo "Run 'npm run dev' to launch both backend and web frontend."
