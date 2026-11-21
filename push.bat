@echo off
cd /d "%~dp0"
echo ================================
echo   Push local code to GitHub
echo ================================
git add -A
git diff --cached --quiet
if %errorlevel% equ 0 (
  echo [i] Nothing changed. Already up to date.
  echo.
  pause
  exit /b 0
)
git commit -m "update %date:~0,10% %time:~0,5%"
if errorlevel 1 goto fail
git push origin main
if errorlevel 1 goto fail
echo.
echo [OK] Pushed to GitHub successfully.
echo.
pause
exit /b 0
:fail
echo.
echo [FAIL] Push failed. Check your network or SSH key.
echo.
pause
exit /b 1
