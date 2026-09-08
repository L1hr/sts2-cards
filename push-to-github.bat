@echo off
setlocal enabledelayedexpansion
title Push sts2-cards to GitHub

set http_proxy=
set https_proxy=
set HTTP_PROXY=
set HTTPS_PROXY=
set all_proxy=
set ALL_PROXY=
set GIT_TERMINAL_PROMPT=0

set "GIT_EXE=C:\Users\eee\.workbuddy\binaries\PortableGit\versions\1.2.0\cmd\git.exe"
set "REPO=C:\Users\eee\WorkBuddy\2026-09-07-15-59-43\sts2-cards"

echo ============================================================
echo   STEP 1  Check git
echo ============================================================
if not exist "%GIT_EXE%" (
  echo [ERROR] git not found: %GIT_EXE%
  echo.
  pause
  exit /b 1
)
echo OK  git found.

cd /d "%REPO%"
if errorlevel 1 (
  echo [ERROR] repo folder not found: %REPO%
  echo.
  pause
  exit /b 1
)
echo OK  repo folder: %CD%
echo.

echo ============================================================
echo   STEP 2  Paste your GitHub Personal Access Token
echo.
echo   No token?  Browser -^> github.com/settings/tokens
echo     Generate new token (classic) -^> check [repo] -^> copy
echo.
echo   NOTE: the token is NOT shown while typing. Just paste
echo   (right-click or Ctrl+V) and press Enter.
echo ============================================================
echo.

set "GHTOKEN="
set /p "GHTOKEN=Token (ghp_...): "

if not defined GHTOKEN (
  echo.
  echo [ERROR] No token entered.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   STEP 3  Pushing... (may take 1-3 minutes, repo is ~60MB)
echo ============================================================
echo.

"%GIT_EXE%" push "https://L1hr:%GHTOKEN%@github.com/L1hr/sts2-cards.git" main > push-log.txt 2>&1
type push-log.txt

if errorlevel 1 (
  echo.
  echo ============================================================
  echo   FAILED.  Usual reasons:
  echo    1. Token wrong / expired / not checked [repo]
  echo    2. Network blocked by your ISP or company
  echo.
  echo   Copy everything above and send it to me.
  echo ============================================================
) else (
  echo.
  echo ============================================================
  echo   SUCCESS!  github.com/L1hr/sts2-cards is up to date.
  echo   Next: open the deploy link on Koyeb.
  echo ============================================================
)

echo.
pause
