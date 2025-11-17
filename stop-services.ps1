# Thor Stack - Stop Native Services (PowerShell)
# Use this before starting Docker containers to free up ports

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Thor Stack - Stop Native Services" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Function to get process on port
function Get-ProcessOnPort {
    param($Port)
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return $connections.OwningProcess
    } catch {
        return $null
    }
}

# Ports to check
$ports = @(3000, 3001, 3002, 3003)
$found = $false

foreach ($port in $ports) {
    $pids = Get-ProcessOnPort -Port $port

    if ($pids) {
        $found = $true
        Write-Host "Port $port in use by PIDs: $pids" -ForegroundColor Red

        foreach ($pid in $pids) {
            try {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                Write-Host "   Process: $($proc.ProcessName) (PID: $pid)" -ForegroundColor Yellow

                # Stop process
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500

                # Verify
                if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
                    Write-Host "   Failed to stop process $pid" -ForegroundColor Red
                } else {
                    Write-Host "   Port $port is now free" -ForegroundColor Green
                }
            } catch {
                Write-Host "   Error stopping process: $_" -ForegroundColor Red
            }
        }
    }
}

if (-not $found) {
    Write-Host "No services found on ports 3000-3003" -ForegroundColor Green
    Write-Host "   Ports are already free" -ForegroundColor White
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Port Status" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Show final port status
foreach ($port in $ports) {
    $pids = Get-ProcessOnPort -Port $port
    if ($pids) {
        Write-Host "[X] Port $port : IN USE" -ForegroundColor Red
    } else {
        Write-Host "[OK] Port $port : FREE" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Ready for Docker containers!" -ForegroundColor Cyan
Write-Host "Run: " -NoNewline -ForegroundColor White
Write-Host "docker compose up -d" -ForegroundColor Yellow
Write-Host ""
