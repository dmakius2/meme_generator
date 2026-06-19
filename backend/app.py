from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
import io
import uuid
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

GENERATED_DIR = "generated"
os.makedirs(GENERATED_DIR, exist_ok=True)

app.mount("/generated", StaticFiles(directory=GENERATED_DIR), name="generated")

FONT_PATHS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_outlined_text(draw: ImageDraw.Draw, x: int, y: int, text: str, font, anchor: str):
    outline_offsets = [(-2, -2), (2, -2), (-2, 2), (2, 2), (0, -2), (0, 2), (-2, 0), (2, 0)]
    for dx, dy in outline_offsets:
        draw.text((x + dx, y + dy), text, font=font, fill="black", anchor=anchor)
    draw.text((x, y), text, font=font, fill="white", anchor=anchor)


@app.post("/generate")
async def generate_meme(
    image: UploadFile = File(...),
    top_text: str = Form(""),
    bottom_text: str = Form(""),
):
    contents = await image.read()

    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail=f"Unsupported image format: {image.content_type}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {e}")

    width, height = img.size
    font_size = max(24, height // 12)
    font = load_font(font_size)

    draw = ImageDraw.Draw(img)

    if top_text.strip():
        draw_outlined_text(draw, width // 2, 10, top_text.upper(), font, anchor="mt")

    if bottom_text.strip():
        draw_outlined_text(draw, width // 2, height - 10, bottom_text.upper(), font, anchor="mb")

    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(GENERATED_DIR, filename)
    img.save(filepath, "JPEG", quality=90)

    return {"url": f"/generated/{filename}"}
