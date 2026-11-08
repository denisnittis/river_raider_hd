# River Raid Remaster HD

A ROM original do River Raid (PAL) roda num emulador de Atari 2600 escrito em JavaScript puro, com renderização WebGL e suporte completo a **Desktop**, **Controles Gamepad** e **Dispositivos Móveis (Celular/Tablet com Controles Touch)**.

Há dois visuais, alternados com a tecla **H** ou botão **✨ HD / 🕹 Retro**:

- **Remaster (HD)**: visual realista (rio, penhascos, selva) com arte customizada e um painel novo
- **Original**: a imagem do Atari 2600, pixel por pixel

Nos dois o jogo é o mesmo. A jogabilidade e o som vêm do código da própria ROM. Só a imagem é redesenhada: o TIA (chip de vídeo) registra o que desenhou em cada frame (objetos, posições, formas) e o modo Remaster redesenha isso com arte nova.

---

## 🎮 Controles no Celular (Touch / Mobile)

O jogo possui um controle virtual completo na tela:

- **D-Pad Virtual (Esquerda)**:
  - Deslize o polegar ou toque nas setas para guiar o caça
  - **▲ Cima**: Acelera o avião
  - **▼ Baixo**: Freia o avião
  - **◀ / ▶ Esquerda / Direita**: Vira a aeronave (suporta diagonais para acelerar/frear fazendo curva)
- **Botão FIRE ⚡ (Direita)**: Dispara mísseis
- **Botão START / RESET**: Inicia o jogo ou reinicia após Game Over
- **Botão SELECT**: Seleciona modo de jogo / dificuldade do Atari
- **Barra Rápida**: Alterna visual (HD/Retro), Som (Mudo/Ativo), Pausa e Tela Cheia

---

## 💻 Controles no Teclado / PC

| Tecla | Ação |
|---|---|
| Enter | Game Reset (começar / reiniciar) |
| Setas / WASD | Voar (cima = acelera, baixo = freia) |
| Espaço / Z / Ctrl | Atirar (Fire) |
| H | Trocar visual: Remaster ↔ Original |
| F | Tela cheia |
| P | Pausa |
| M | Som liga/desliga |
| F2 | Debug: mostra quais objetos foram reconhecidos |

Controle USB/Bluetooth (gamepad) também é reconhecido automaticamente.

---

## 🚀 Como Colocar Online no GitHub (GitHub Pages)

Você pode hospedar o jogo 100% grátis no GitHub Pages. Siga os passos:

### 1. Criar um repositório no GitHub
1. Acesse [github.com/new](https://github.com/new)
2. Dê um nome ao repositório (ex: `river-raid-hd` ou `river-raid`)
3. Deixe como **Public** (Público)
4. Não marque "Initialize with README" (já temos tudo pronto) e clique em **Create repository**

### 2. Enviar o código para o GitHub
Abra o terminal (PowerShell ou Git Bash) dentro da pasta `river-raid-hd` e rode:

```bash
git init
git add .
git commit -m "feat: River Raid Remaster HD com suporte mobile e GitHub Pages"
git branch -M main
git remote add origin https://github.com/<SEU-USUARIO>/<NOME-DO-REPOSITORIO>.git
git push -u origin main
```
*(Substitua `<SEU-USUARIO>` e `<NOME-DO-REPOSITORIO>` pelos seus dados do GitHub)*

### 3. Ativar o GitHub Pages
1. No repositório no GitHub, clique na aba **Settings**
2. No menu lateral esquerdo, clique em **Pages**
3. Em **Build and deployment > Source**, selecione **GitHub Actions** (ou **Deploy from a branch** -> branch `main` / root)
4. Pronto! O GitHub irá gerar o link do jogo:
   `https://<SEU-USUARIO>.github.io/<NOME-DO-REPOSITORIO>/`

O link funcionará direto tanto no computador quanto no navegador do celular!

**A ROM não vai para o GitHub** (`roms/` está no `.gitignore`, porque o River
Raid é protegido por direitos autorais). No site, na primeira vez, a página
pede o arquivo `.a26`: o jogador escolhe a própria ROM, que fica só no
aparelho dele, e o navegador lembra dela nas próximas vezes. No celular, basta
copiar o arquivo para o aparelho antes. Jogando localmente pelo `jogar.bat`,
a ROM da pasta `roms/` é usada direto.

---

## 🛠 Como Jogar Localmente

Dê dois cliques no arquivo `jogar.bat` (usa o Node ou, se não houver, o Python). O navegador abrirá automaticamente em `http://localhost:8642`.
