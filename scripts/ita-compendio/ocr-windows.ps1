# Legge il testo di una o più immagini con l'OCR di Windows (Windows.Media.Ocr).
# Per ogni immagine scrive accanto un file <immagine>.ocr.json con le righe e, per ogni riga, le
# parole con il loro riquadro in pixel: l'ordine di lettura lo ricostruisce chi chiama
# (lib/ordine-di-lettura.ts). Lo lancia ocr_windows_pdf.py; da solo:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ocr-windows.ps1 <elenco.txt> [lingua]
#   elenco.txt: un percorso di immagine per riga. Lingua: it-IT (se non indicata) o en-US.
# Serve il pacchetto della lingua fra quelli di Windows (Impostazioni > Lingua > Riconoscimento
# ottico dei caratteri); nessuna installazione a parte.
param([Parameter(Mandatory = $true)][string]$Elenco, [string]$Lingua = 'it-IT')

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

# Le operazioni di WinRT sono asincrone e PowerShell 5 non sa aspettarle da solo: si passa da
# AsTask, che va cercato a mano perché è generico.
$asTaskGenerico = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Attendi($operazione, $tipo) {
  $attivita = $asTaskGenerico.MakeGenericMethod($tipo).Invoke($null, @($operazione))
  $attivita.Wait(-1) | Out-Null
  $attivita.Result
}

$motore = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Lingua))
if ($null -eq $motore) { Write-Error "Lingua OCR non disponibile: $Lingua"; exit 1 }

$fatte = 0
foreach ($percorso in Get-Content -LiteralPath $Elenco -Encoding UTF8) {
  if (-not $percorso.Trim()) { continue }
  $file = Attendi ([Windows.Storage.StorageFile]::GetFileFromPathAsync($percorso)) ([Windows.Storage.StorageFile])
  $flusso = Attendi ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decodificatore = Attendi ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flusso)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Attendi ($decodificatore.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $esito = Attendi ($motore.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $righe = foreach ($riga in $esito.Lines) {
    $parole = foreach ($p in $riga.Words) {
      $r = $p.BoundingRect
      [ordered]@{ t = $p.Text; x = [math]::Round($r.X); y = [math]::Round($r.Y); w = [math]::Round($r.Width); h = [math]::Round($r.Height) }
    }
    [ordered]@{ parole = @($parole) }
  }
  $uscita = [ordered]@{ larghezza = $bitmap.PixelWidth; altezza = $bitmap.PixelHeight; righe = @($righe) }
  [System.IO.File]::WriteAllText("$percorso.ocr.json", ($uscita | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
  $flusso.Dispose()
  $fatte++
}
Write-Output "immagini lette: $fatte"
