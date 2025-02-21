import barcode
from barcode.writer import ImageWriter
from PIL import Image, ImageFont, ImageDraw

games = open("games.txt", "r").readlines()

for b, g in enumerate(games):

    g = g.strip("\n")
    bc_type = "Code39"
    code = str(b + 1).zfill(6)

    options = dict(
        module_width=0.22,
        module_height=11,
        quiet_zone=0.5,
        background="white",
        foreground="black",
        center_text=True,
        format="PNG",
        write_text=False
    )

    bc = barcode.get('code39', code, writer=ImageWriter())
    bc.save(f'tmp/tmp', options=options)

    width = 205 * 2
    height = 96 * 2
    
    color = (0, 0, 0)

    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    tmp = Image.open(f'tmp/tmp.png', 'r')

    img_w, img_h = tmp.size
    offset = ((width - img_w) // 2, 10)
    image.paste(tmp, offset)
   
    text_loc = (35, height - 30)
    draw.text(text_loc, f"{g} ({code})", color)

    image.save(f"tmp/barcode_{code}.png")

