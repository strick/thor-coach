#!/bin/bash
# MCP Server launcher for Thor
# Sets proper encoding and environment

export LC_ALL=C.UTF-8
export LANG=C.UTF-8

# Source nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node 22
nvm use 22 >/dev/null 2>&1

# Run the MCP server
exec node "$(dirname "$0")/dist/index.js"
