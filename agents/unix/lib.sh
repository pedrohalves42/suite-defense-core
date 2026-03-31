#!/usr/bin/env bash
#
# CyberShield Agent - Shared Unix Library v6.0
# Common functions for Linux and macOS agents.
# Sourced by platform-specific entrypoints.
#
# This file MUST NOT be executed directly.

# Prevent direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "ERROR: lib.sh must be sourced, not executed directly." >&2
    exit 1
fi

# ============================================
#  MODULE LOADER
# ============================================
_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib"

source "$_LIB_DIR/constants.sh"
source "$_LIB_DIR/logging.sh"
source "$_LIB_DIR/fsm.sh"
source "$_LIB_DIR/network.sh"
source "$_LIB_DIR/crypto.sh"
source "$_LIB_DIR/integrity.sh"
source "$_LIB_DIR/baseline.sh"
source "$_LIB_DIR/jobs.sh"
source "$_LIB_DIR/heartbeat.sh"
source "$_LIB_DIR/main-loop.sh"
