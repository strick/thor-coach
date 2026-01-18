#!/bin/bash
# Migration helper - Run migrations inside the Docker container
# Usage: ./migrate.sh <database-container-name> <migration-file>

CONTAINER=${1:-thor-api}
MIGRATION=${2:-migrations/001-add-friday-exercises.js}

echo "Running migration inside Docker container: $CONTAINER"
docker exec $CONTAINER node $MIGRATION
