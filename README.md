# Meme Generator

A simple full-stack app for making memes: upload an image, add top/bottom caption text, and get back a rendered meme image. Captions are drawn in the classic white-with-black-outline meme font, automatically sized to the image.

## Architecture

```
┌─────────────────────┐        multipart/form-data         ┌───────────────────────┐
│   React + Vite SPA   │ ───────────  POST /generate ─────► │   FastAPI backend     │
│  (frontend/)         │                                     │   (backend/app.py)    │
│                       │ ◄──────── { "url": "..." } ──────  │                        │
└─────────────────────┘                                     └───────────────────────┘
                                                                        │
                                                              Pillow draws text on
                                                              the image, saves a
                                                              JPEG to generated/,
                                                              served back as a
                                                              static file
```

- **Frontend** — a single-page React/TypeScript app (Vite) with one form: pick an image, type top/bottom text, submit. It POSTs the image + text to the backend as `multipart/form-data` and renders the returned meme image with a download link.
- **Backend** — a FastAPI app that receives the upload, uses Pillow (PIL) to overlay the captions on the image, saves the result, and returns its URL.
- There are two versions of the backend with identical `/generate` logic, differing only in where the rendered image is stored:
  - `backend/app.py` — for local development. Saves the JPEG to a local `generated/` folder and serves it via FastAPI's static file mount.
  - `backend/lambda_function.py` — for AWS deployment. Uploads the JPEG to an S3 bucket and returns its public S3 URL, wrapped with [Mangum](https://github.com/jordaneremieff/mangum) so the FastAPI app can run inside AWS Lambda behind API Gateway.

## File reference

### Backend (`backend/`)
| File | Purpose |
|---|---|
| `app.py` | Local FastAPI server. Defines the `POST /generate` endpoint, loads a system font, draws outlined top/bottom text on the uploaded image with Pillow, saves it under `generated/`, and serves that folder at `/generated`. |
| `lambda_function.py` | AWS Lambda variant of the same FastAPI app. Same image-processing logic, but uploads the output JPEG to the S3 bucket named in the `GENERATED_BUCKET` env var instead of writing to disk, and exposes a Mangum `handler` for Lambda's runtime. |
| `fonts/DejaVuSans-Bold.ttf` | Bundled caption font, used as the fallback by `lambda_function.py` (Lambda has no system fonts) and as a last-resort fallback in `app.py`. |
| `generated/` | Local output directory for memes produced by `app.py` when running locally (gitignored except for `.gitkeep`). |
| `requirements.txt` | Python dependencies for running the FastAPI server locally (`fastapi`, `uvicorn`, `pillow`, `python-multipart`). |
| `requirements-lambda.txt` | Python dependencies for the Lambda deployment (`fastapi`, `mangum`, `python-multipart`; boto3/Pillow come from the Lambda layer/runtime or the packaged build). |
| `lambda_package/`, `lambda_package.zip` | Vendored third-party dependencies and a zipped build artifact used to deploy `lambda_function.py` to AWS Lambda. Not needed for local development. |

### Frontend (`frontend/`)
| File | Purpose |
|---|---|
| `src/main.tsx` | App entry point; mounts `<App />` into the DOM. |
| `src/App.tsx` | Root component; renders `MemeGenerator`. |
| `src/components/MemeGenerator.tsx` | The entire UI: image upload + preview, top/bottom text inputs, submit/reset buttons, calls the backend's `/generate` endpoint, and displays the resulting meme with a download link. |
| `src/index.css` | Page styling. |
| `.env` / `.env.example` | Defines `VITE_API_BASE`, the backend URL the frontend calls (defaults to `http://localhost:8000`). |
| `vite.config.ts`, `tsconfig*.json` | Vite/TypeScript build configuration. |
| `package.json` | Frontend dependencies and scripts (`dev`, `build`, `preview`, `typecheck`). |

## Running locally

Requires Python 3.11+ and Node.js 18+.

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

The API will be available at `http://localhost:8000`, with generated memes served from `http://localhost:8000/generated/<filename>`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

This starts the Vite dev server (typically `http://localhost:5173`). The frontend reads `VITE_API_BASE` from `frontend/.env` to know where the backend lives — it's already set to `http://localhost:8000` to match the steps above.

### 3. Use it

Open the Vite dev server URL in your browser, upload an image, optionally add top/bottom text, and click **Generate Meme**.

## AWS deployment

In production the app runs entirely on AWS instead of localhost — the live deployment's API base (`frontend/.env`) points to an API Gateway endpoint in `us-east-2`:

```
┌────────────┐  static assets  ┌──────────────────────┐         ┌──────────┐         ┌──────────────────┐
│  Browser   │ ◄────────────── │  S3 static website    │         │  API     │ ──────► │  Lambda            │
│            │ ── POST /generate (fetch) ─────────────────────► │  Gateway │         │  (lambda_function)│
└────────────┘                 │  (frontend/dist)      │         └──────────┘         └──────────────────┘
                                └──────────────────────┘                                       │
                                                                                       puts JPEG object
                                                                                                ▼
                                                                                   S3 bucket (GENERATED_BUCKET)
```

- **Frontend** — `npm run build` produces static assets in `frontend/dist/`, which are uploaded to an S3 bucket configured for static website hosting. `frontend/.env` is set to the API Gateway invoke URL before building, so the deployed bundle calls the live API instead of `localhost:8000`.
- **Backend** — `backend/lambda_function.py` runs as an AWS Lambda function (via the `Mangum` handler), invoked through API Gateway. Generated meme images are written to an S3 bucket rather than local disk, and their public S3 URLs are returned to the frontend. The Lambda's execution role needs `s3:PutObject` on that bucket, and the function needs a `GENERATED_BUCKET` environment variable set to its name.
- **Deployment is manual** (no IaC/CI in this repo) — `backend/lambda_package.zip` is the deployment artifact:
  1. Install Lambda dependencies into `backend/lambda_package/`: `pip install -r requirements-lambda.txt -t lambda_package/`
  2. Copy `lambda_function.py` and the `fonts/` directory into `lambda_package/`
  3. Zip the contents: `cd lambda_package && zip -r ../lambda_package.zip .`
  4. Upload the new code to the existing Lambda function: `aws lambda update-function-code --function-name <function-name> --zip-file fileb://lambda_package.zip`
  5. For the frontend, after updating `frontend/.env` with the API Gateway URL: `npm run build && aws s3 sync dist/ s3://<frontend-bucket-name>`
