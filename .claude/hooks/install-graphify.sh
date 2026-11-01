#!/bin/bash
# Installe l'outil graphify au démarrage d'une session cloud (la skill en a besoin).
set -e
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
command -v graphify >/dev/null 2>&1 && exit 0
uv tool install graphifyy >/dev/null 2>&1 || pip install --user graphifyy >/dev/null 2>&1 || true
