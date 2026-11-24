@echo off
setlocal
title Lanzador de Servidor Wall Panel V4 - Familia Varela Paez
color 0b

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ===================================================
echo   INICIANDO SERVIDOR WALL PANEL V4 - VARELA PAEZ
echo ===================================================
echo.

:: Abrir puerto 3001 en el Firewall de Windows automaticamente si se ejecuta como Administrador
netsh advfirewall firewall show rule name="WallPanel IoT Port 3001" >nul 2>&1
if %errorlevel% neq 0 (
    echo [FIREWALL] Habilitando acceso para Tablet en red local ^(Puerto 3001^)...
    netsh advfirewall firewall add rule name="WallPanel IoT Port 3001" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1
)

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Node.js instalado.
    pause
    exit
)

if not exist "node_modules\" (
    echo Instalando dependencias necesarias...
    call npm install
)

echo [AUTO] Abriendo el Wall Panel en tu navegador...
start http://127.0.0.1:3001

:iniciar_server
node server.js
echo.
echo [ADVERTENCIA] El servidor se detuvo. Reiniciando en 3 segundos...
timeout /t 3 /nobreak
goto iniciar_server
