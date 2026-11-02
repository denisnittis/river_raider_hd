@echo off
cd /d "%~dp0"
echo ========================================================
echo   PUBLICANDO NO GITHUB E ATIVANDO GITHUB PAGES
echo   Repositorio: denisnittis/river_raider_hd
echo ========================================================
echo.
git push -u origin main
git push -u origin gh-pages --force
echo.
echo ========================================================
echo   [CONCLUIDO] Branches main e gh-pages enviadas!
echo ========================================================
echo.
pause
