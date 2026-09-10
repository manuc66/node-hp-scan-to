[CmdletBinding(DefaultParameterSetName = "Setup")]
param(
    [Parameter(ParameterSetName = "Setup", Mandatory = $true)]
    [string]$PrinterIP,

    [Parameter(ParameterSetName = "Setup")]
    [switch]$IpRedirect,

    [Parameter(ParameterSetName = "Setup")]
    [string]$PrinterIPv6,

    [Parameter(ParameterSetName = "Setup")]
    [int]$ListenPort = 8443,

    [Parameter(ParameterSetName = "Setup")]
    [ValidateSet("https", "http")]
    [string]$ForwardScheme = "https",

    [Parameter(ParameterSetName = "Setup")]
    [Parameter(ParameterSetName = "Restore")]
    [string]$ConfigIni,

    [Parameter(ParameterSetName = "Setup")]
    [string]$MitmwebPath,

    [Parameter(ParameterSetName = "Setup")]
    [int]$WebPort = 8081,

    [Parameter(ParameterSetName = "Setup")]
    [int]$WebPortHttp = 8082,

    [Parameter(ParameterSetName = "Setup")]
    [int]$HttpProxyPort = 8444,

    [Parameter(ParameterSetName = "Setup")]
    [string]$SaveFlows,

    [Parameter(ParameterSetName = "Restore")]
    [switch]$Restore,

    [Parameter()]
    [switch]$SkipElevate
)

$ErrorActionPreference = "Stop"
$progressPreference = "SilentlyContinue"

function Write-Step { param([string]$m) [Console]::Out.WriteLine("==> $m") }
function Write-Ok { param([string]$m) [Console]::Out.WriteLine("    OK  $m") }
function Write-Warn { param([string]$m) [Console]::Out.WriteLine("    WARN $m") }

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Mitmweb {
    param([string]$Explicit)
    if ($Explicit) {
        if (-not (Test-Path -LiteralPath $Explicit)) { throw "MitmwebPath not found: $Explicit" }
        return (Resolve-Path -LiteralPath $Explicit).Path
    }
    $c = Get-Command mitmweb.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $candidates = @(
        "$env:ProgramFiles\mitmproxy\bin\mitmweb.exe",
        "${env:ProgramFiles(x86)}\mitmproxy\bin\mitmweb.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python31*\Scripts\mitmweb.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python39*\Scripts\mitmweb.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python*\Scripts\mitmweb.exe",
        "$env:APPDATA\Python\Python*\Scripts\mitmweb.exe"
    )
    foreach ($c in $candidates) {
        $g = Get-ChildItem -Path $c -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($g) { return $g.FullName }
    }
    $py = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($py) {
        $s = Join-Path (Split-Path $py.Source) "Scripts\mitmweb.exe"
        if (Test-Path -LiteralPath $s) { return $s }
    }
    throw "mitmweb.exe not found. Install mitmproxy (https://www.mitmproxy.org) or pass -MitmwebPath."
}

function Find-HpIni {
    param([string]$Explicit, [string]$PrinterIP)
    if ($Explicit) {
        if (-not (Test-Path -LiteralPath $Explicit)) { throw "ConfigIni not found: $Explicit" }
        return (Resolve-Path -LiteralPath $Explicit).Path
    }
    $roots = @("$env:ProgramData\HP", "$env:ProgramFiles\HP")
    $all = @()
    foreach ($r in $roots) {
        if (Test-Path -LiteralPath $r) {
            $all += Get-ChildItem -LiteralPath $r -Recurse -Filter *.ini -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match "NetworkDevices" } |
                Select-Object -ExpandProperty FullName
        }
    }
    $all = @($all | Select-Object -Unique)
    if ($all.Count -eq 0) {
        throw "No NetworkDevices\*.ini found under ProgramData\HP or Program Files\HP. Pass -ConfigIni <path>."
    }
    if ($all.Count -eq 1) { return $all[0] }
    $matchIP = @($all | Where-Object {
        try { (Get-Content -LiteralPath $_ -Raw -ErrorAction Stop) -match [regex]::Escape($PrinterIP) } catch { $false }
    })
    if ($matchIP.Count -ge 1) {
        if ($matchIP.Count -eq 1) { return $matchIP[0] }
        Write-Warn "Several NetworkDevices ini reference $PrinterIP; using the first."
        return $matchIP[0]
    }
    return $all[0]
}

function Read-IniText {
    param([string]$Path, [ref]$Encoding)
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $Encoding.Value = "Unicode"
        return [System.Text.Encoding]::Unicode.GetString($bytes)
    }
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $Encoding.Value = "UTF8"
        return [System.Text.Encoding]::UTF8.GetString($bytes)
    }
    $Encoding.Value = "Default"
    return [System.Text.Encoding]::Default.GetString($bytes)
}

function Write-IniText {
    param([string]$Path, [string]$Text, [string]$Encoding)
    switch ($Encoding) {
        "Unicode" {
            $data = [System.Text.Encoding]::Unicode.GetPreamble() + [System.Text.Encoding]::Unicode.GetBytes($Text)
        }
        "UTF8" {
            $data = [System.Text.Encoding]::UTF8.GetPreamble() + [System.Text.Encoding]::UTF8.GetBytes($Text)
        }
        default {
            $data = [System.Text.Encoding]::Default.GetBytes($Text)
        }
    }
    [System.IO.File]::WriteAllBytes($Path, $data)
}

function Get-HpTempDir {
    return (Join-Path $env:TEMP "hp-mitm-capture")
}

function Get-BackupDir {
    return (Join-Path (Get-HpTempDir) "backups")
}

function Get-SessionStateFile {
    $dir = Get-HpTempDir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return (Join-Path $dir "session-state.txt")
}

function Write-SessionState {
    param([hashtable]$Data)
    $lines = $Data.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    Set-Content -LiteralPath (Get-SessionStateFile) -Value $lines -Encoding ASCII
}

function Read-SessionState {
    $f = Get-SessionStateFile
    $h = @{}
    if (Test-Path -LiteralPath $f) {
        Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match "^(.*?)=(.*)$") { $h[$Matches[1]] = $Matches[2] }
        }
    }
    return $h
}

function Backup-Ini {
    param([string]$Ini)
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $base = [System.IO.Path]::GetFileNameWithoutExtension($Ini)
    $dir = Get-BackupDir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $target = Join-Path $dir "ini-$base-$stamp.ini"
    Copy-Item -LiteralPath $Ini -Destination $target -Force
    Write-Ok "backed up driver ini to $target"
    return $target
}

function Get-SessionIniPtr {
    $dir = Get-BackupDir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return (Join-Path $dir "session-ini.txt")
}

function Find-LatestBackup {
    param([string]$Ini)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($Ini)
    $dir = Get-BackupDir
    if (-not (Test-Path -LiteralPath $dir)) { return $null }
    $cands = Get-ChildItem -LiteralPath $dir -Filter "ini-$base-*.ini" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if ($cands.Count -eq 0) { return $null }
    $pristine = @($cands | Where-Object {
        try { -not ((Get-Content -LiteralPath $_.FullName -Raw -ErrorAction Stop) -match "IPAddress\s*=\s*127\.0\.0\.1") } catch { $true }
    })
    if ($pristine.Count -gt 0) { return $pristine[0].FullName }
    return $cands[0].FullName
}

function Remove-MitmproxyCAPaths {
    foreach ($store in @("Cert:\LocalMachine\Root", "Cert:\CurrentUser\Root")) {
        $certs = Get-ChildItem $store -ErrorAction SilentlyContinue |
            Where-Object { $_.Subject -like "*mitmproxy*" }
        foreach ($cert in $certs) {
            try {
                Remove-Item -LiteralPath ($store + "\" + $cert.Thumbprint) -ErrorAction Stop
                Write-Ok "removed CA $($cert.Subject) from $store"
            } catch {
                Write-Warn "could not remove CA from $store : $_"
            }
        }
    }
}

function Teardown-IpRedirect {
    param([string]$Ip, [int]$HttpPort)
    $route = Get-NetRoute -DestinationPrefix "$Ip/32" -ErrorAction SilentlyContinue
    if ($route) {
        Remove-NetRoute -DestinationPrefix "$Ip/32" -InterfaceIndex $route[0].ifIndex -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        Write-Ok "removed route $Ip/32"
    }
    $addr = Get-NetIPAddress -IPAddress $Ip -ErrorAction SilentlyContinue
    if ($addr) {
        Remove-NetIPAddress -IPAddress $Ip -InterfaceIndex $addr[0].InterfaceIndex -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        Write-Ok "removed local address $Ip"
    }
    netsh interface portproxy delete v4tov4 listenaddress=$Ip listenport=80 2>$null | Out-Null
    Write-Ok "removed portproxy $Ip:80 -> 127.0.0.1:$HttpPort"
}

function Start-Mitmweb {
    param([string]$Exe, [string[]]$ProcArgs, [string]$Tag)
    $dir = Get-HpTempDir
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $errFile = Join-Path $dir "mitmweb-$Tag-stderr.txt"
    $outFile = Join-Path $dir "mitmweb-$Tag-stdout.txt"
    $p = Start-Process -FilePath $Exe -ArgumentList $ProcArgs -WindowStyle Hidden `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru
    Start-Sleep -Seconds 2
    if ($p.HasExited) {
        $detail = ""
        if (Test-Path -LiteralPath $errFile) {
            $lines = @(Get-Content -LiteralPath $errFile -ErrorAction SilentlyContinue | Select-Object -Last 4)
            if ($lines.Count) { $detail = "`n" + ($lines -join "`n") }
        }
        throw "mitmweb ($Tag) exited immediately. Is the port in use? $detail"
    }
    return $p
}

function Ensure-CA {
    param([string]$Mitmweb)
    $caPem = Join-Path (Join-Path $HOME ".mitmproxy") "mitmproxy-ca-cert.pem"
    if (-not (Test-Path -LiteralPath $caPem)) {
        Write-Step "Generating the mitmproxy CA (first run)..."
        $probe = Start-Process -FilePath $Mitmweb -ArgumentList @(
            "--listen-host", "127.0.0.1", "--listen-port", "9123",
            "--no-web-open-browser", "--set", "web_password=init"
        ) -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path (Get-HpTempDir) "mitmweb-cagen-stdout.txt") `
            -RedirectStandardError (Join-Path (Get-HpTempDir) "mitmweb-cagen-stderr.txt")
        $deadline = (Get-Date).AddSeconds(15)
        while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $caPem)) { Start-Sleep -Milliseconds 300 }
        Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path -LiteralPath $caPem)) {
        throw "mitmproxy CA was not generated at $caPem."
    }
    Write-Ok "mitmproxy CA ready: $caPem"
    return $caPem
}

function Import-CA-IntoStore {
    param([string]$CaPem)
    Write-Step "Importing the mitmproxy CA into the Windows root store"
    $imported = $false
    try {
        Import-Certificate -FilePath $CaPem -CertStoreLocation Cert:\LocalMachine\Root -ErrorAction Stop | Out-Null
        Write-Ok "installed into Cert:\LocalMachine\Root"
        $imported = $true
    } catch {
        Write-Warn "LocalMachine\Root import failed: $_"
    }
    if (-not $imported) {
        try {
            Import-Certificate -FilePath $CaPem -CertStoreLocation Cert:\CurrentUser\Root -ErrorAction Stop | Out-Null
            Write-Ok "installed into Cert:\CurrentUser\Root"
            $imported = $true
        } catch {
            throw "Could not import the mitmproxy CA into any root store: $_"
        }
    }
}

function Write-SessionReadme {
    param([string]$Dir, [string[]]$Lines)
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    $readme = Join-Path $Dir "README.txt"
    Set-Content -LiteralPath $readme -Value $Lines -Encoding Default
    Write-Ok "session info written to $readme"
}

if (-not $SkipElevate -and -not (Test-Admin)) {
    Write-Step "Requesting administrator rights (UAC)..."
    $parts = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    foreach ($k in $PSBoundParameters.Keys) {
        $v = $PSBoundParameters[$k]
        if ($v -is [switch]) {
            if ($v) { $parts += "-$k" }
        } else {
            $parts += "-$k"
            $parts += "`"$v`""
        }
    }
    $logDir = Get-HpTempDir
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $log = Join-Path $logDir "setup-log.txt"
    $logErr = $log + ".err"
    $p = $null
    try {
        $p = Start-Process -FilePath "powershell.exe" -ArgumentList $parts -Verb RunAs -Wait -PassThru `
            -RedirectStandardOutput $log -RedirectStandardError $logErr
    } catch {
        Write-Warn "Elevation was refused or failed. Re-run this script from an elevated PowerShell (Run as administrator)."
        exit 0
    }
    [Console]::Out.WriteLine("")
    if (Test-Path -LiteralPath $log) {
        Get-Content -LiteralPath $log | ForEach-Object { [Console]::Out.WriteLine($_) }
    }
    if (Test-Path -LiteralPath $logErr) {
        [Console]::Out.WriteLine("-- errors --")
        Get-Content -LiteralPath $logErr | ForEach-Object { [Console]::Out.WriteLine($_) }
    }
    exit $p.ExitCode
}

$stale = @(Get-Process mitmweb -ErrorAction SilentlyContinue)
if ($stale.Count -gt 0) {
    Write-Warn "stopping stale mitmweb from a previous session (PID $($stale.Id -join ', '))"
    $stale | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

if ($Restore) {
    Write-Step "Restore mode"
    $state = Read-SessionState
    $ini = $null
    if ($state["Mode"] -eq "IpRedirect") {
        Teardown-IpRedirect -Ip $state["PrinterIP"] -HttpPort ([int]$state["HttpPort"])
    } else {
        if ($ConfigIni) {
            if (Test-Path -LiteralPath $ConfigIni) { $ini = (Resolve-Path -LiteralPath $ConfigIni).Path }
        }
        if (-not $ini) {
            $ptr = Get-SessionIniPtr
            if (Test-Path -LiteralPath $ptr) {
                $ini = Get-Content -LiteralPath $ptr -ErrorAction SilentlyContinue |
                    Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
                    Select-Object -First 1
            }
        }
        if (-not $ini) {
            Write-Warn "No HP driver ini known for restore. Re-run with -Restore -ConfigIni <path>."
        } else {
            $backup = Find-LatestBackup -Ini $ini
            if (-not $backup) {
                Write-Warn "No backup found for $ini in $(Get-BackupDir). Nothing to restore."
            } else {
                Copy-Item -LiteralPath $backup -Destination $ini -Force
                Write-Ok "restored $ini from $backup"
            }
        }
    }
    if (-not $ini) {
        try { $ini = Find-HpIni -Explicit "" -PrinterIP "127.0.0.1" } catch { $ini = $null }
    }
    if ($ini -and (Test-Path -LiteralPath $ini)) {
        $enc = "Default"
        $txt = Read-IniText -Path $ini -Encoding ([ref]$enc)
        if ($txt -match "(?im)^[ \t]*IPAddress[ \t]*=\s*127\.0\.0\.1") {
            $pb = Find-LatestBackup -Ini $ini
            if ($pb) {
                Copy-Item -LiteralPath $pb -Destination $ini -Force
                Write-Ok "repaired $ini (was pointed to 127.0.0.1) from $pb"
            } else {
                Write-Warn "$ini points to 127.0.0.1 but no pristine backup found; edit it manually."
            }
        }
    }
    Remove-MitmproxyCAPaths
    Get-Process mitmweb -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Step "Done. Restart the HP application so it re-reads the printer IP, then re-run discovery."
    exit 0
}

if (-not ($PrinterIP -as [System.Net.IPAddress])) {
    throw "PrinterIP '$PrinterIP' is not a valid IPv4 address."
}
$mitmweb = Find-Mitmweb -Explicit $MitmwebPath
Write-Ok "mitmweb: $mitmweb"

$ini = Find-HpIni -Explicit $ConfigIni -PrinterIP $PrinterIP
if ($ini -notlike "*\*.ini") {
    throw "Find-HpIni returned an invalid path: '$ini'"
}
Write-Ok "driver config: $ini"

$enc = "Default"
$text = Read-IniText -Path $ini -Encoding ([ref]$enc)
if ($text -match "(?im)^[ \t]*IPAddress[ \t]*=\s*(\S+)") {
    $iniIP = $Matches[1]
} else {
    $iniIP = $null
}
if ($text -match "(?im)^[ \t]*PortNumber[ \t]*=\s*(\d+)") {
    $iniPort = [int]$Matches[1]
} else {
    $iniPort = $null
}
if ($text -match "(?im)^[ \t]*IPv6Address[ \t]*=\s*(\S+)") {
    $iniV6 = $Matches[1]
} else {
    $iniV6 = $null
}
Write-Ok "ini says IPAddress=$iniIP PortNumber=$iniPort IPv6Address=$iniV6"

if ($IpRedirect) {
    Write-Step "Mode: IP redirection (intercept 192.168.129.X on this machine, forward via IPv6 link-local)"
    if (-not $PrinterIPv6) {
        if (-not $iniV6) {
            throw "-IpRedirect needs the printer IPv6 link-local: auto-read from the ini failed. Pass -PrinterIPv6 fe80::..."
        }
        $PrinterIPv6 = $iniV6
    }
    $upstream = "https://[$PrinterIPv6]"
    $upstreamHttp = "http://[$PrinterIPv6]"

    $loop = @(Get-NetIPInterface -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -like "*loopback*" -or $_.InterfaceDescription -like "*loopback*" })
    if ($loop.Count -eq 0) {
        $loop = @(Get-NetIPInterface -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceIndex -eq 1 })
    }
    if ($loop.Count -lt 1) { throw "Loopback adapter not found." }
    $loopIdx = $loop[0].InterfaceIndex

    Write-Step "Hijacking $PrinterIP to the loopback interface (ifIndex $loopIdx)"
    $existingIp = Get-NetIPAddress -IPAddress $PrinterIP -ErrorAction SilentlyContinue
    if ($existingIp) {
        Write-Warn "$PrinterIP already assigned locally; removing it first (previous session not restored?)"
        Remove-NetIPAddress -IPAddress $PrinterIP -InterfaceIndex $existingIp[0].InterfaceIndex -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    }
    Get-NetRoute -DestinationPrefix "$PrinterIP/32" -ErrorAction SilentlyContinue |
        Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    netsh interface portproxy delete v4tov4 listenaddress=$PrinterIP listenport=443 2>$null | Out-Null
    netsh interface portproxy delete v4tov4 listenaddress=$PrinterIP listenport=80 2>$null | Out-Null
    New-NetIPAddress -InterfaceIndex $loopIdx -IPAddress $PrinterIP -PrefixLength 32 | Out-Null
    New-NetRoute -InterfaceIndex $loopIdx -DestinationPrefix "$PrinterIP/32" -ErrorAction SilentlyContinue | Out-Null
    Write-Ok "$PrinterIP now routes to localhost"

    $tokenH = -join ((48..57) + (97..122) | Get-Random -Count 12 | ForEach-Object { [char]$_ })
    $tokenW = -join ((48..57) + (97..122) | Get-Random -Count 12 | ForEach-Object { [char]$_ })

    Write-Step "Starting mitmweb reverse proxy (HTTPS $PrinterIP:443 -> $upstream)"
    $argsH = @(
        "--listen-host", $PrinterIP, "--listen-port", "443",
        "--mode", "reverse:$upstream",
        "--ssl-insecure", "--no-web-open-browser",
        "--set", "connection_strategy=lazy",
        "--set", "web_password=$tokenH",
        "--set", "web_port=$WebPort"
    )
    $p443 = Start-Mitmweb -Exe $mitmweb -ProcArgs $argsH -Tag "https-443"

    Write-Step "Starting mitmweb reverse proxy (HTTP $PrinterIP:80 via portproxy -> 127.0.0.1:$HttpProxyPort -> $upstreamHttp)"
    $argsW = @(
        "--listen-host", "127.0.0.1", "--listen-port", "$HttpProxyPort",
        "--mode", "reverse:$upstreamHttp",
        "--ssl-insecure", "--no-web-open-browser",
        "--set", "connection_strategy=lazy",
        "--set", "web_password=$tokenW",
        "--set", "web_port=$WebPortHttp"
    )
    $p8444 = Start-Mitmweb -Exe $mitmweb -ProcArgs $argsW -Tag "http-8444"
    netsh interface portproxy add v4tov4 listenaddress=$PrinterIP listenport=80 connectaddress=127.0.0.1 connectport=$HttpProxyPort | Out-Null
    Write-Ok "portproxy $PrinterIP:80 -> 127.0.0.1:$HttpProxyPort"

    $caPem = Ensure-CA -Mitmweb $mitmweb
    Import-CA-IntoStore -CaPem $caPem

    Write-SessionState @{
        Mode = "IpRedirect"
        PrinterIP = $PrinterIP
        PrinterIPv6 = $PrinterIPv6
        HttpPort = $HttpProxyPort
        Pid443 = $p443.Id
        Pid8444 = $p8444.Id
    }
    Write-SessionReadme -Dir (Join-Path $PWD "hp-mitm-capture") -Lines @(
        "mitmproxy IP-redirect capture session - $(Get-Date -Format s)",
        "Printer   : $PrinterIP (intercepted on this machine)",
        "Upstream  : $upstream  /  $upstreamHttp",
        "HTTPS UI  : http://127.0.0.1:$WebPort  (token: $tokenH)",
        "HTTP  UI  : http://127.0.0.1:$WebPortHttp  (token: $tokenW)",
        "PIDs      : $($p443.Id), $($p8444.Id)",
        "Ini       : $ini"
    )

    Write-Step "Capture is armed (IP redirection). Next steps:"
    [Console]::Out.WriteLine("  1. Keep this machine on the LAN. Only outbound connections to $PrinterIP are intercepted; the printer itself is untouched.")
    [Console]::Out.WriteLine("  2. Restart the HP application (ScanToPCActivationApp / HP Scan).")
    [Console]::Out.WriteLine("  3. HTTPS events: open http://127.0.0.1:$WebPort, token $tokenH")
    [Console]::Out.WriteLine("  4. HTTP events:   open http://127.0.0.1:$WebPortHttp, token $tokenW")
    [Console]::Out.WriteLine("  5. Trigger the scan / device events from the printer panel.")
    [Console]::Out.WriteLine("  6. When done: $PSCommandPath -Restore")
} else {
    Write-Step "Mode: ini redirect (point the driver at a local reverse proxy)"

    if ($PrinterIP -notin @("127.0.0.1", "localhost")) {
        $reachable = Test-NetConnection -ComputerName $PrinterIP -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($reachable) {
            Write-Ok "printer reachable on TCP 443 (HTTPS)"
        } else {
            Write-Warn "printer is not reachable on TCP 443; it may only speak plain HTTP on ports 80/8080. Use -ForwardScheme http if needed."
        }
    }

    Set-Content -LiteralPath (Get-SessionIniPtr) -Value $ini -Encoding ASCII

    $alreadyRedirected = ($iniIP -and $iniIP -eq "127.0.0.1")
    if ($alreadyRedirected) {
        Write-Warn "the driver ini already points to 127.0.0.1 (previous capture not restored?)"
        Write-Warn "not taking a new backup (it would not be pristine); run -Restore to put the printer IP back"
    }
    if ($iniPort) {
        if ($ForwardScheme -eq "https" -and $iniPort -notin @("443", "8443")) {
            Write-Warn "ini PortNumber=$iniPort suggests plain HTTP; if the scan fails, re-run with -ForwardScheme http"
        }
        if ($ForwardScheme -eq "http" -and $iniPort -eq "443") {
            Write-Warn "ini PortNumber=443 suggests HTTPS; if the scan fails, re-run with -ForwardScheme https"
        }
    }

    if ($alreadyRedirected) {
        $backup = Find-LatestBackup -Ini $ini
        if (-not $backup) { $backup = "<none>" }
    } else {
        $backup = Backup-Ini -Ini $ini
    }
    $hasIp = ($text -match "(?im)^[ \t]*IPAddress[ \t]*=.*$")
    $hasPort = ($text -match "(?im)^[ \t]*PortNumber[ \t]*=.*$")
    $newText = $text -replace "(?im)^[ \t]*IPAddress[ \t]*=.*$", "IPAddress=127.0.0.1"
    $newText = $newText -replace "(?im)^[ \t]*PortNumber[ \t]*=.*$", "PortNumber=$ListenPort"
    if (-not ($hasIp -or $hasPort)) {
        Write-Warn "neither IPAddress= nor PortNumber= found in the ini; leaving the file untouched (edit it manually or pass -ConfigIni)."
    } else {
        Write-IniText -Path $ini -Text $newText -Encoding $enc
        Write-Ok "driver now points to 127.0.0.1:$ListenPort"
    }

    $webToken = -join ((48..57) + (97..122) | Get-Random -Count 12 | ForEach-Object { [char]$_ })
    $webPortArgs = @()
    if ($WebPort -gt 0) { $webPortArgs += "--set"; $webPortArgs += "web_port=$WebPort" }
    $flowArgs = @()
    if ($SaveFlows) { $flowArgs = @("--save-stream-file", $SaveFlows) }

    $target = "reverse:$ForwardScheme" + "://" + $PrinterIP
    $procArgs = @(
        "--listen-host", "127.0.0.1",
        "--listen-port", "$ListenPort",
        "--mode", $target,
        "--ssl-insecure",
        "--no-web-open-browser",
        "--set", "connection_strategy=lazy",
        "--set", "web_password=$webToken"
    ) + $webPortArgs + $flowArgs

    Write-Step "Starting mitmweb reverse proxy (127.0.0.1:$ListenPort -> $target)"
    $p = Start-Mitmweb -Exe $mitmweb -ProcArgs $procArgs -Tag "ini"
    Write-Ok "mitmweb running (PID $($p.Id))"

    $caPem = Ensure-CA -Mitmweb $mitmweb
    Import-CA-IntoStore -CaPem $caPem

    Write-SessionState @{
        Mode = "IniRedirect"
        PrinterIP = $PrinterIP
        Port = $ListenPort
        BackedUpIni = $backup
        Ini = $ini
    }
    Write-SessionReadme -Dir (Join-Path $PWD "hp-mitm-capture") -Lines @(
        "mitmproxy ini-redirect capture session - $(Get-Date -Format s)",
        "Printer  : $PrinterIP",
        "Proxy    : 127.0.0.1:$ListenPort",
        "Mode     : $target",
        "mitmweb  : http://127.0.0.1:$WebPort  (ui token: $webToken)",
        "PID      : $($p.Id)",
        "Backup   : $backup",
        "Ini      : $ini"
    )

    Write-Step "Capture is armed (ini redirect). Next steps:"
    [Console]::Out.WriteLine("  1. Close and restart the HP scan application (ScanToPCActivationApp / HP Scan).")
    [Console]::Out.WriteLine("  2. The driver will talk to 127.0.0.1:$ListenPort instead of the real printer.")
    [Console]::Out.WriteLine("  3. Open the mitmweb UI at http://127.0.0.1:$WebPort and enter the token: $webToken")
    [Console]::Out.WriteLine("  4. Trigger a scan from the printer panel.")
    [Console]::Out.WriteLine("  5. When done, restore the driver with:")
    [Console]::Out.WriteLine("     powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Restore")
}