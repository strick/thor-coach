@echo off
REM Thor Stack - Build Script for Windows Command Prompt

echo ========================================
echo   Thor Stack - Docker Build Script
echo ========================================
echo.

REM Check if Docker is running
echo Checking Docker status...
docker ps >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running.
    echo Please start Docker Desktop and try again.
    exit /b 1
)
echo [OK] Docker is running
echo.

REM Check for .env.docker file
echo Checking configuration...
if not exist ".env.docker" (
    echo Warning: .env.docker not found
    echo Creating from example...
    copy ".env.docker.example" ".env.docker" >nul
    echo [OK] Created .env.docker
) else (
    echo [OK] Configuration file found
)

echo.
echo ========================================
echo   Building Docker Images
echo ========================================

REM Build thor-api
echo.
echo [1/3] Building thor-api (REST API + SQLite)...
docker compose build thor-api
if errorlevel 1 (
    echo [ERROR] Failed to build thor-api
    exit /b 1
)
echo [OK] thor-api built successfully

REM Build thor-web
echo.
echo [2/3] Building thor-web (Web Dashboard)...
docker compose build thor-web
if errorlevel 1 (
    echo [ERROR] Failed to build thor-web
    exit /b 1
)
echo [OK] thor-web built successfully

REM Build thor-agent
echo.
echo [3/3] Building thor-agent (Conversational AI + MCP)...
docker compose build thor-agent
if errorlevel 1 (
    echo [ERROR] Failed to build thor-agent
    exit /b 1
)
echo [OK] thor-agent built successfully

REM Success
echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Images built:
echo   - thor-api    (Port 3000)
echo   - thor-web    (Port 3001)
echo   - thor-agent  (Port 3002)
echo.
echo Next steps:
echo   1. Review .env.docker configuration
echo   2. Start services: docker compose up -d
echo   3. View logs: docker compose logs -f
echo   4. Access web UI: http://localhost:3001
echo.
