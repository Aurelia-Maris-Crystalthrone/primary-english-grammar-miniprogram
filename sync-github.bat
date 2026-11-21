@echo off
chcp 65001 >nul
cd /d "E:\primary-english-grammar-miniprogram"
if errorlevel 1 goto fail

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto fail

for /f %%a in ('git status --porcelain') do set CHANGED=1
if not defined CHANGED (
    echo [%date% %time%] no local changes, skip
    exit /b 0
)

git add -A
if errorlevel 1 goto fail

for /f "tokens=1-2 delims= " %%a in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set STAMP=%%a %%b
git commit -m "chore: auto-sync %STAMP%"
if errorlevel 1 goto fail

git push origin main
if errorlevel 1 goto fail

echo [%date% %time%] synced OK
exit /b 0

:fail
echo [%date% %time%] SYNC FAILED >> "E:\primary-english-grammar-miniprogram\sync-error.log"
exit /b 1
