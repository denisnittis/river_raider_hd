@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo   PUBLICAR RIVER RAID REMASTER NO GITHUB PAGES
echo ========================================================
echo.
echo Cole aqui o link completo do seu repositorio do GitHub
echo (Exemplo: https://github.com/seunome/river-raid-hd.git)
echo.
set /p REPO_URL="Link do Repositório: "

if "%REPO_URL%"=="" (
    echo.
    echo [ERRO] Link não informado. Tente novamente.
    pause
    exit /b
)

echo.
echo Configurando repositorio remoto...
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git branch -M main

echo.
echo Enviando arquivos para o GitHub...
echo (Se uma janela pedir login, faça login com sua conta do GitHub)
echo.
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCESSO] Arquivos enviados com sucesso para o GitHub!
    echo ========================================================
    echo.
    echo Agora vá na página do repositório no GitHub:
    echo 1. Clique em "Settings" (Configurações)
    echo 2. Clique em "Pages" no menu da esquerda
    echo 3. Em "Source", selecione "GitHub Actions" (ou "Deploy from a branch")
    echo.
) else (
    echo.
    echo [ATENÇÃO] Houve um problema no envio. Verifique o link e seu login.
)

pause
