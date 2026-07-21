$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-SiapsWorkbook([string]$Path, [string]$Kind) {
    $zip = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        function Read-Entry([string]$Name) {
            $entry = $zip.GetEntry($Name)
            if (-not $entry) { return $null }
            $reader = [IO.StreamReader]::new($entry.Open())
            try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
        }

        [xml]$sharedXml = Read-Entry "xl/sharedStrings.xml"
        $shared = @()
        foreach ($item in $sharedXml.sst.si) {
            if ($item.t) { $shared += [string]$item.t }
            else { $shared += (($item.r | ForEach-Object { [string]$_.t }) -join "") }
        }

        [xml]$sheet = Read-Entry "xl/worksheets/sheet1.xml"
        $records = @()
        foreach ($row in $sheet.worksheet.sheetData.row) {
            $rowNumber = [int]$row.r
            if ($rowNumber -lt 19 -or $rowNumber -gt 150) { continue }
            $values = @{}
            foreach ($cell in $row.c) {
                $column = ([string]$cell.r) -replace '\d', ''
                $value = [string]$cell.v
                if ($cell.t -eq "s" -and $value -ne "") { $value = $shared[[int]$value] }
                $values[$column] = $value
            }
            if (-not $values["A"] -or -not $values["D"]) { continue }
            $record = [ordered]@{
                cnes = $values["A"]
                estabelecimento = $values["B"]
                tipo = $values["C"]
                ine = $values["D"]
                equipe = $values["E"]
            }
            if ($Kind -eq "m1") {
                $record.atendimentos = [int]$values["G"]
                $record.pessoas = [int]$values["H"]
                $record.media = [double](($values["I"] -replace ',', '.'))
            } else {
                $record.compartilhadas = [int]$values["G"]
                $record.acoes = [int]$values["H"]
                $record.proporcao = [double](($values["I"] -replace ',', '.'))
            }
            $records += [pscustomobject]$record
        }
        return $records
    } finally { $zip.Dispose() }
}

$m1Path = (Get-ChildItem -LiteralPath $PSScriptRoot -Filter "m1*.xlsx" | Select-Object -First 1).FullName
$m2Path = (Get-ChildItem -LiteralPath $PSScriptRoot -Filter "m2*.xlsx" | Select-Object -First 1).FullName
if (-not $m1Path -or -not $m2Path) { throw "Arquivos M1 e M2 nao encontrados." }
$m1 = Read-SiapsWorkbook $m1Path "m1"
$m2 = Read-SiapsWorkbook $m2Path "m2"
$m2ByKey = @{}
foreach ($item in $m2) { $m2ByKey["$($item.cnes)|$($item.ine)"] = $item }

$merged = foreach ($item in $m1) {
    $other = $m2ByKey["$($item.cnes)|$($item.ine)"]
    $ap = "N/I"
    if ($item.estabelecimento -match ' AP\s*(\d)(\d)\b') { $ap = "$($Matches[1]).$($Matches[2])" }
    [ordered]@{
        cnes = $item.cnes; ine = $item.ine; ap = $ap
        estabelecimento = $item.estabelecimento; equipe = $item.equipe; tipo = $item.tipo
        atendimentos = $item.atendimentos; pessoas = $item.pessoas; media = $item.media
        compartilhadas = if ($other) { $other.compartilhadas } else { 0 }
        acoes = if ($other) { $other.acoes } else { 0 }
        proporcao = if ($other) { $other.proporcao } else { 0 }
    }
}

$json = $merged | ConvertTo-Json -Depth 3 -Compress
$content = "window.SIAPS_DATA = $json;`n"
[IO.File]::WriteAllText((Join-Path $PSScriptRoot "dados.js"), $content, [Text.UTF8Encoding]::new($false))
Write-Output "dados.js gerado com $($merged.Count) equipes."
