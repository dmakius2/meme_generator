import io
import os
import uuid

import boto3
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
from mangum import Mangum

app = FastAPI()

BUCKET_NAME = os.environ["GENERATED_BUCKET"]
s3 = boto3.client("s3")

FONT_PATHS = [
    os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans-Bold.ttf"),
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

    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=90)
    buffer.seek(0)

    filename = f"{uuid.uuid4().hex}.jpg"
    s3.put_object(Bucket=BUCKET_NAME, Key=filename, Body=buffer.getvalue(), ContentType="image/jpeg")

    region = s3.meta.region_name
    url = f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{filename}"
    return {"url": url}


handler = Mangum(app)
