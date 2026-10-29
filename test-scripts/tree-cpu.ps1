# Total CPU seconds (user + kernel) used so far by a process and all its descendants.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tree-cpu.ps1 <rootPid>
param([int]$RootPid)
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, UserModeTime, KernelModeTime
$keep = @{ $RootPid = $true }
do {
  $grew = $false
  foreach ($p in $all) {
    if (-not $keep.ContainsKey([int]$p.ProcessId) -and $keep.ContainsKey([int]$p.ParentProcessId)) {
      $keep[[int]$p.ProcessId] = $true
      $grew = $true
    }
  }
} while ($grew)
$sum = 0
foreach ($p in $all) { if ($keep.ContainsKey([int]$p.ProcessId)) { $sum += $p.UserModeTime + $p.KernelModeTime } }
"{0:F3}" -f ($sum / 1e7)
