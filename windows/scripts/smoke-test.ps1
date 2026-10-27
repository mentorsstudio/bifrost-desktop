<#
  Teste de fumaça do Bifrost numa máquina Windows real.

  Uso (PowerShell, sem administrador):
    powershell -ExecutionPolicy Bypass -File .\smoke-test.ps1
    powershell -ExecutionPolicy Bypass -File .\smoke-test.ps1 -Exe "C:\caminho\bifrost-desktop.exe"

  O que faz:
    1. acha o Bifrost instalado;
    2. roda "bifrost-desktop.exe --diagnostico" (escreve um JSON em %TEMP% e sai);
    3. abre o Bifrost se ele não estiver aberto e confere o processo;
    4. confere o pipe dos hooks (\\.\pipe\bifrost-desktop-<sid>);
    5. confere o servidor MCP em 127.0.0.1:<porta> (padrão 47821);
    6. lista os agentes e programas detectados.

  Não muda nada no PC além de abrir o Bifrost. Não lê nem mostra tokens ou chaves.
  Sai com código 0 se tudo passou, ou com o número de falhas.
#>
param([string]$Exe = "", [int]$Espera = 10)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$falhas = 0
$avisos = 0
function Ok($t)    { Write-Host "  [OK]    $t" -ForegroundColor Green }
function Falha($t) { Write-Host "  [FALHA] $t" -ForegroundColor Red; $script:falhas++ }
function Aviso($t) { Write-Host "  [AVISO] $t" -ForegroundColor Yellow; $script:avisos++ }
function Secao($t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }

Write-Host "Teste de fumaça do Bifrost — $(Get-Date -Format 'dd/MM/yyyy HH:mm')"

# 1. Onde está o Bifrost
Secao "Instalação"
if (-not $Exe) {
  $candidatos = @(
    "$env:LOCALAPPDATA\Bifrost\Bifrost.exe",
    "$env:ProgramFiles\Bifrost\Bifrost.exe",
    "$env:LOCALAPPDATA\Programs\Bifrost\bifrost-desktop.exe",
    "$env:LOCALAPPDATA\Bifrost\bifrost-desktop.exe",
    "$env:ProgramFiles\Bifrost\bifrost-desktop.exe",
    "${env:ProgramFiles(x86)}\Bifrost\bifrost-desktop.exe"
  )
  $Exe = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $Exe -or -not (Test-Path $Exe)) {
  Falha "Bifrost.exe / bifrost-desktop.exe não encontrado. Passe o caminho com -Exe."
  Write-Host ""; Write-Host "Resultado: não deu para testar sem o executável." -ForegroundColor Red
  exit 1
}
Ok "Executável: $Exe ($((Get-Item $Exe).VersionInfo.ProductVersion))"
$hook = Join-Path (Split-Path $Exe) "bifrost-hook.exe"
if (Test-Path $hook) { Ok "bifrost-hook.exe ao lado do Bifrost" } else { Falha "bifrost-hook.exe não está ao lado do Bifrost (os hooks não vão funcionar)" }

# 2. Diagnóstico
Secao "Diagnóstico"
$json = Join-Path $env:TEMP "bifrost-diagnostico.json"
Remove-Item $json -ErrorAction SilentlyContinue
$p = Start-Process -FilePath $Exe -ArgumentList "--diagnostico", "`"$json`"" -PassThru -WindowStyle Hidden
if (-not $p.WaitForExit(30000)) { try { $p.Kill() } catch {} }
$diag = $null
if (Test-Path $json) {
  $diag = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "Diagnóstico gerado: $json (versão $($diag.versao))"
} else {
  Falha "O Bifrost não gerou o diagnóstico (versão antiga sem --diagnostico?)"
}

# 3. Processo
Secao "Processo"
$proc = Get-Process -Name "bifrost-desktop", "Bifrost" -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe -or $_.ProcessName -match "bifrost" }
if (-not $proc) {
  Write-Host "  Abrindo o Bifrost e esperando $Espera s…"
  Start-Process -FilePath $Exe | Out-Null
  Start-Sleep -Seconds $Espera
  $proc = Get-Process -Name "bifrost-desktop", "Bifrost" -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe -or $_.ProcessName -match "bifrost" }
}
if ($proc) {
  $mb = [math]::Round((($proc | Measure-Object WorkingSet64 -Sum).Sum) / 1MB)
  Ok "Bifrost rodando (PID $(($proc | Select-Object -First 1).Id), $mb MB)"
  if (@($proc).Count -gt 1) { Aviso "$(@($proc).Count) processos bifrost-desktop (esperado: 1 instância)" }
} else {
  Falha "O Bifrost não ficou aberto depois de $Espera s"
}

# 4. Pipe dos hooks
Secao "Pipe dos hooks"
$pipes = @()
# Split-Path não entende caminhos \\.\pipe\…: o nome é o que vem depois da última barra.
try { $pipes = @([System.IO.Directory]::GetFiles("\\.\pipe\") | ForEach-Object { ($_ -split '\\')[-1] }) } catch { Aviso "Não deu para listar os pipes: $($_.Exception.Message)" }
$esperado = if ($diag) { ($diag.pipe -split '\\')[-1] } else { "" }
$achado = $pipes | Where-Object { $_.StartsWith("bifrost-desktop-", [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
if ($esperado -and ($pipes | Where-Object { $_ -ieq $esperado })) { Ok "Pipe aberto: \\.\pipe\$esperado" }
elseif ($esperado -and [System.IO.File]::Exists("\\.\pipe\$esperado")) { Ok "Pipe aberto: \\.\pipe\$esperado" }
elseif ($achado) { Aviso "Pipe aberto ($achado), mas diferente do esperado ($esperado)" }
else { Falha "Nenhum pipe bifrost-desktop-* aberto: os hooks do Claude Code não chegam à ilha" }

# 5. Servidor MCP
Secao "Servidor MCP"
$porta = if ($diag -and $diag.mcpServidor.porta) { [int]$diag.mcpServidor.porta } else { 47821 }
$ligado = (-not $diag) -or $diag.mcpServidor.ligado
if (-not $ligado) {
  Aviso "Servidor MCP desligado nos Ajustes (Chat → Servidor MCP do Bifrost)"
} else {
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $conn = $tcp.BeginConnect("127.0.0.1", $porta, $null, $null)
    if ($conn.AsyncWaitHandle.WaitOne(3000) -and $tcp.Connected) {
      Ok "Porta 127.0.0.1:$porta aceitando conexões"
      try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$porta/mcp" -Method Post -Body '{}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
        Aviso "O /mcp respondeu $($r.StatusCode) sem token (esperado: 401)"
      } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 401) { Ok "/mcp exige token (401 sem Bearer), como deve" }
        elseif ($code) { Aviso "/mcp respondeu $code sem token" }
        else { Falha "/mcp não respondeu HTTP: $($_.Exception.Message)" }
      }
    } else { Falha "Nada escutando em 127.0.0.1:$porta" }
  } finally { $tcp.Close() }
}

# 6. Agentes e programas
Secao "Agentes detectados"
if ($diag) {
  $ag = @($diag.agentes)
  if ($ag.Count -eq 0) { Aviso "Nenhum agente rodando agora (abra o Claude Code ou o Codex num terminal e rode de novo)" }
  foreach ($a in $ag) {
    $onde = @($a.host, $a.folder) | Where-Object { $_ } | Select-Object -Unique
    Write-Host ("  - {0} [{1}] {2}" -f $a.name, $a.kind, ($onde -join " · "))
  }
  $ids = $ag | ForEach-Object { $_.agent } | Group-Object | Where-Object { $_.Name -eq "ollama" -and $_.Count -gt 1 }
  if ($ids) { Falha "O Ollama aparece mais de uma vez" } elseif ($ag | Where-Object { $_.agent -eq "ollama" }) { Ok "Ollama aparece uma vez" }
  $aux = $ag | Where-Object { $_.name -match "code-mode-host|computer-use|sandbox-service" }
  if ($aux) { Falha "Processos auxiliares do Codex listados como sessão: $($aux.name -join ', ')" } else { Ok "Nenhum auxiliar do Codex listado como sessão" }
  Write-Host "  Programas encontrados: $((@($diag.programas)) -join ', ')"
  Write-Host "  Servidores MCP configurados: $((@($diag.mcpServidores)) -join ', ')"
}

Secao "Resultado"
if ($falhas -eq 0) { Write-Host "  Tudo certo ($avisos aviso(s))." -ForegroundColor Green }
else { Write-Host "  $falhas falha(s), $avisos aviso(s). Mande esta saída e o arquivo $json para análise." -ForegroundColor Red }
exit $falhas
