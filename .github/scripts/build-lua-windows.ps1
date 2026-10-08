$ErrorActionPreference = 'Stop'
$archive = Join-Path $env:RUNNER_TEMP 'lua.tar.gz'
Invoke-WebRequest "https://www.lua.org/ftp/lua-$env:LUA_VERSION.tar.gz" -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $env:LUA_SHA256) {
    throw 'Upstream Lua archive checksum mismatch'
}
tar -xzf $archive -C $env:RUNNER_TEMP
if ($LASTEXITCODE -ne 0) { throw 'Lua archive extraction failed' }
$source = Join-Path $env:RUNNER_TEMP "lua-$env:LUA_VERSION/src"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'MSVC tools unavailable' }
$developer = Join-Path $installation 'Common7/Tools/VsDevCmd.bat'
Push-Location $source
try {
    # Compile the interpreter and core; luac.c is a separate executable with its own main().
    $sources = (Get-ChildItem '*.c' | Where-Object Name -ne 'luac.c' | ForEach-Object Name) -join ' '
    @"
@echo off
call "$developer" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%
cl /nologo /O2 /MD /Fe:lua.exe $sources
exit /b %errorlevel%
"@ | Set-Content 'build-lua.cmd' -Encoding ascii
    cmd.exe /d /c build-lua.cmd
    if ($LASTEXITCODE -ne 0) { throw 'Lua compilation failed' }
} finally { Pop-Location }
$interpreter = Join-Path $source 'lua.exe'
& $interpreter -v
if ($LASTEXITCODE -ne 0) { throw 'Lua interpreter failed' }
"LUA_BIN=$interpreter" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
