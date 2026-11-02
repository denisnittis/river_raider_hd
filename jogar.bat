@echo off
cd /d "%~dp0"
start "" http://localhost:8642
where node >nul 2>nul && (node tools\devserver.mjs 8642) || (python -m http.server 8642)
