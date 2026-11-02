# Arte do modo Remaster com o Nano Banana

## Como funciona

1. Gere cada imagem abaixo no Gemini (Nano Banana).
2. Salve em `assets/remaster/raw/` com o nome indicado (`.png` ou `.jpg`).
3. Rode: `python tools/prepare_art.py`
4. Recarregue o jogo e aperte **H** até chegar no modo **Remaster**.

O script remove o fundo magenta, recorta, encaixa cada imagem na caixa do
objeto original e cria as versões espelhadas sozinho. Não precisa gerar tudo
de uma vez: o que faltar continua com a arte embutida.

## Regras para todas as imagens de objetos

- **Fundo magenta liso (#FF00FF)**: é ele que o script remove.
- Um único objeto, centralizado, sem sombra no fundo, sem texto (exceto FUEL).
- Mesma luz em tudo: sol do **canto superior esquerdo**.
- Use a proporção da tabela (são as que o Nano Banana oferece). O script recorta
  o objeto, então sobra de fundo magenta não tem problema.

Comece cada prompt com este estilo, para as imagens combinarem entre si:

> Photorealistic 3D render, video game asset, military jungle river theme,
> soft late-afternoon sunlight from the upper left, high detail, single object
> centered, isolated on a flat solid magenta background (#FF00FF), no shadow on
> the background, no border, no text.

## Objetos

Se o Gemini insistir em colocar paisagem no fundo, salve mesmo assim e me avise:
dá para recortar o objeto. Só é preciso que ele esteja inteiro na imagem.


| Arquivo | Proporção | Prompt (depois do estilo) |
|---|---|---|
| `player` | 1:1 | A yellow single-engine fighter plane seen directly from above (top-down view), nose pointing up, wings fully spread, white star roundels on the wings, glass canopy, propeller blur at the nose. |
| `player_left` | 1:1 | *(Opcional: se faltar, o script cria a pose inclinada a partir do `player`.)* The same yellow fighter plane seen from above, nose up, banking to the left: the left wing tilted down and foreshortened, the right wing raised. |
| `heli` | 16:9 | An olive-green military attack helicopter seen from the side, nose pointing RIGHT, rotor blades visible, skids underneath. |
| `ship` | 16:9 | A long, low dark gray military tanker ship with red hull bottom, seen from the side, bow pointing RIGHT, white bridge cabin at the back. The ship is about four times longer than it is tall. |
| `jet` | 16:9 | A gray enemy fighter jet seen from the side, nose pointing RIGHT, red insignia on the tail. |
| `house` | 16:9 | A small jungle military outpost hut with a corrugated metal roof, seen from the front, very low and wide (about four times wider than tall). |
| `tree` | 16:9 | A wide, bushy tropical jungle tree seen from the front, dense dark-green foliage, short trunk, about twice as wide as it is tall. |
| `bridge` | 16:9 | A concrete and steel road bridge segment seen directly from above, the road running LEFT to RIGHT across the whole image width, yellow dashed center line, guard rails along the top and bottom edges. The bridge is about three times wider than tall. |
| `fuel` | 9:16 | A floating fuel depot barge seen from above, red and white stripes, the word "FUEL" written vertically in large white letters, one letter under the other. |

Quer o helicóptero visto de cima, como na sua imagem de referência? Troque o
prompt por: *An olive-green military helicopter seen directly from above,
nose pointing RIGHT, four rotor blades spread out.*

## Texturas (sem fundo magenta)

Proporção **1:1**. Use este estilo no lugar do anterior:

> Seamless tileable texture, aerial top-down view, photorealistic, square,
> soft sunlight from the upper left, no objects, no text.

| Arquivo | Prompt (depois do estilo) |
|---|---|
| `water` | Dark teal jungle river water with gentle ripples and subtle sun glints. |
| `rock` | Wet dark gray-brown rocky cliff surface with boulders, cracks and patches of moss. |
| `jungle` | Dense tropical rainforest canopy, palm and broadleaf tree crowns, deep shadows between the trees. |

## Painel (opcional)

Proporção **16:9**, com o mesmo estilo dos objetos (fundo magenta). O painel
real é muito mais largo que 16:9, então peça uma faixa fina; o script recorta
o fundo magenta e aproveita só a faixa.

`panel`: *A long, thin horizontal video game HUD panel strip spanning the full
image width, about nine times wider than tall, centered vertically. Dark
weathered gunmetal with rivets, scratches and grime, three recessed empty bays
(left, center, right), no text, no numbers.*

Placar, combustível e vidas continuam desenhados pelo jogo por cima do painel.
