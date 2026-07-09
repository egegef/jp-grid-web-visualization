@echo off
setlocal
cd /d "%~dp0"
echo Starting local web server at http://127.0.0.1:8000/
echo Keep this window open while viewing the page.
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8000 --bind 127.0.0.1
) else (
  python -m http.server 8000 --bind 127.0.0.1
)
