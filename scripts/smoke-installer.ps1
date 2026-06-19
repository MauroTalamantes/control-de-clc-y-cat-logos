param(
  [Parameter(Mandatory = $true)]
  [string]$SetupPath,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion,
  [string]$PreviousSetupPath
)

$ErrorActionPreference = "Stop"
$previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
$env:ELECTRON_RUN_AS_NODE = $null
$installDirectory = Join-Path $env:LOCALAPPDATA "Programs\control-de-clc-y-catalogos"
$appPath = Join-Path $installDirectory "Control de CLC y Catalogos.exe"
$uninstallerPath = Join-Path $installDirectory "Uninstall Control de CLC y Catalogos.exe"
$smokeUserData = Join-Path ([System.IO.Path]::GetTempPath()) "control-clc-smoke-$([guid]::NewGuid().ToString('N'))"

function Invoke-Setup {
  param([string]$Path)
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $process = Start-Process -FilePath $resolvedPath -ArgumentList "/S", "/currentuser" -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Installer failed with exit code $($process.ExitCode): $resolvedPath"
  }
}

try {
  if ($PreviousSetupPath) {
    Write-Host "Installing previous release to exercise the upgrade path."
    Invoke-Setup -Path $PreviousSetupPath
  }

  Write-Host "Installing current release."
  Invoke-Setup -Path $SetupPath
  if (-not (Test-Path -LiteralPath $appPath)) {
    throw "Installed executable was not found: $appPath"
  }

  New-Item -ItemType Directory -Path $smokeUserData -Force | Out-Null
  $smokeProcess = Start-Process -FilePath $appPath -ArgumentList "--user-data-dir=$smokeUserData", "--smoke-test", "--expected-version=$ExpectedVersion" -Wait -PassThru -WindowStyle Hidden
  if ($smokeProcess.ExitCode -ne 0) {
    throw "Packaged application smoke test failed with exit code $($smokeProcess.ExitCode)."
  }
}
finally {
  if (Test-Path -LiteralPath $uninstallerPath) {
    $uninstallProcess = Start-Process -FilePath $uninstallerPath -ArgumentList "/S", "/currentuser" -Wait -PassThru -WindowStyle Hidden
    if ($uninstallProcess.ExitCode -ne 0) {
      Write-Warning "Uninstaller returned exit code $($uninstallProcess.ExitCode)."
    }
  }
  $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedSmokeData = [System.IO.Path]::GetFullPath($smokeUserData)
  if ($resolvedSmokeData.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedSmokeData)) {
    Remove-Item -LiteralPath $resolvedSmokeData -Recurse -Force
  }
  $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode
}
