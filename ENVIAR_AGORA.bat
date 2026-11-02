@echo off
cd /d "%~dp0"
echo ========================================================
echo   ENVIANDO RIVER RAID PARA O SEU GITHUB
echo   Repositorio: denisnittis/river_raider_hd
echo ========================================================
echo.
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo   [SUCESSO] Todos os arquivos foram enviados!
    echo ========================================================
) else (
    echo Houve uma solicitacao de login ou permissao.
)
echo.
pause
