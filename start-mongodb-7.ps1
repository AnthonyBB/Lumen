# Run this after installing MongoDB 7.0 to reconfigure the service
$ErrorActionPreference = "Stop"

Write-Host "Configuring MongoDB service for version 7.0..." -ForegroundColor Cyan

# Stop existing service
Stop-Service "MongoDB" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Find MongoDB 7.0 installation
$mongod7 = "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"
$cfg7 = "C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg"

if (-not (Test-Path $mongod7)) {
    Write-Error "MongoDB 7.0 not found at $mongod7. Please install it first."
    exit 1
}

# Update the service binary path
sc.exe config MongoDB binPath= "`"$mongod7`" --config `"$cfg7`" --service"
Write-Host "Service updated to use MongoDB 7.0" -ForegroundColor Green

# Start the service
Start-Service "MongoDB"
Start-Sleep -Seconds 5

$svc = Get-Service "MongoDB"
Write-Host "Service status: $($svc.Status)" -ForegroundColor $(if($svc.Status -eq 'Running'){'Green'}else{'Red'})

if ($svc.Status -eq 'Running') {
    Write-Host "`n MongoDB is running on port 27017" -ForegroundColor Green
} else {
    Write-Host "`nCheck log: C:\Program Files\MongoDB\Server\7.0\log\mongod.log" -ForegroundColor Yellow
}
