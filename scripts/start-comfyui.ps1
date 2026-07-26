$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$comfyRoot = Join-Path $projectRoot 'ComfyUI'
$python = Join-Path $comfyRoot '.venv-codex\Scripts\python.exe'
$model = Join-Path $comfyRoot 'models\checkpoints\sd_turbo.safetensors'

if (-not (Test-Path -LiteralPath $python)) {
  throw 'ComfyUI Python environment is missing. Re-run the local setup first.'
}
if (-not (Test-Path -LiteralPath $model)) {
  throw 'SD-Turbo model is missing from ComfyUI\models\checkpoints.'
}

Set-Location -LiteralPath $comfyRoot
& $python main.py `
  --listen 127.0.0.1 `
  --port 8188 `
  --lowvram `
  --reserve-vram 1.0 `
  --disable-auto-launch
