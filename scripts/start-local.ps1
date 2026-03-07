param(
  [ValidateSet('preview','dev')]
  [string]$Mode = 'preview',
  [int]$Port = 5175
)

$ErrorActionPreference = 'Stop'
$workdir = Split-Path -Parent $PSScriptRoot

# Stop only vite node processes for this workspace.
$procs = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.CommandLine -like "*$workdir*vite*"
  }

foreach ($proc in $procs) {
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1

if ($Mode -eq 'dev') {
  Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port',"$Port",'--strictPort','--clearScreen','false' -WorkingDirectory $workdir | Out-Null
} else {
  Start-Process npm.cmd -ArgumentList 'run','preview','--','--host','127.0.0.1','--port',"$Port",'--strictPort' -WorkingDirectory $workdir | Out-Null
}

$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) {
      $ok = $true
      break
    }
  } catch {
    # retry
  }
}

if (-not $ok) {
  Write-Output "FAILED http://127.0.0.1:$Port/"
  exit 1
}

Write-Output "READY http://127.0.0.1:$Port/"
