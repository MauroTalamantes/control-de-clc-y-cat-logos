$ErrorActionPreference = "Stop"

$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

function Write-WorkerMessage {
  param([hashtable]$Message)

  [Console]::Out.WriteLine(($Message | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$excel = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false
  $excel.EnableEvents = $false

  Write-WorkerMessage @{ type = "ready" }

  while (($line = [Console]::In.ReadLine()) -ne $null) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $message = $line | ConvertFrom-Json
    if ($message.type -eq "shutdown") {
      break
    }
    if ($message.type -ne "convert") {
      continue
    }

    $workbook = $null
    try {
      $xlsxPath = [System.IO.Path]::GetFullPath([string]$message.xlsxPath)
      $pdfPath = [System.IO.Path]::GetFullPath([string]$message.pdfPath)
      $workbook = $excel.Workbooks.Open($xlsxPath, 0, $true)
      $workbook.ExportAsFixedFormat(0, $pdfPath)
      Write-WorkerMessage @{ type = "result"; id = [string]$message.id; ok = $true }
    }
    catch {
      Write-WorkerMessage @{
        type = "result"
        id = [string]$message.id
        ok = $false
        error = $_.Exception.Message
      }
    }
    finally {
      if ($workbook -ne $null) {
        $workbook.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
      }
    }
  }
}
catch {
  Write-WorkerMessage @{ type = "fatal"; error = $_.Exception.Message }
  exit 1
}
finally {
  if ($excel -ne $null) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
