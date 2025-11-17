#!/bin/bash
# Thor Stack - Stop Native Services Script
# Use this before starting Docker containers to free up ports

echo "========================================="
echo "  Thor Stack - Stop Native Services"
echo "========================================="
echo ""

# Find and kill processes on Thor ports
PORTS="3000 3001 3002 3003"
FOUND=0

for PORT in $PORTS; do
    PIDS=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$PIDS" ]; then
        FOUND=1
        echo "🔴 Port $PORT in use by PIDs: $PIDS"
        # Get process name
        NAMES=$(lsof -i:$PORT 2>/dev/null | grep LISTEN | awk '{print $1}' | uniq)
        echo "   Process(es): $NAMES"

        # Kill processes
        echo "$PIDS" | xargs kill 2>/dev/null

        # Verify killed
        sleep 0.5
        if lsof -ti:$PORT >/dev/null 2>&1; then
            echo "   ⚠️  Warning: Trying force kill..."
            echo "$PIDS" | xargs kill -9 2>/dev/null
        fi

        # Check again
        if ! lsof -ti:$PORT >/dev/null 2>&1; then
            echo "   ✅ Port $PORT is now free"
        else
            echo "   ❌ Failed to free port $PORT"
        fi
    fi
done

if [ $FOUND -eq 0 ]; then
    echo "✅ No services found on ports 3000-3003"
    echo "   Ports are already free"
fi

echo ""
echo "========================================="
echo "  Port Status"
echo "========================================="

# Show final port status
for PORT in $PORTS; do
    if lsof -ti:$PORT >/dev/null 2>&1; then
        echo "❌ Port $PORT: IN USE"
    else
        echo "✅ Port $PORT: FREE"
    fi
done

echo ""
echo "Ready for Docker containers!"
echo "Run: docker compose up -d"
echo ""
