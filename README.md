# Meme Generator

A full-stack meme creation app with user accounts, a built-in stock photo library, and per-user meme history. Users can sign up, log in, pick a stock photo or upload their own, add top/bottom caption text, generate a meme, and later view, download, or delete their past creations.

## Features

- **Stock photo library** — pick from a built-in set of images instead of uploading your own
- **Carousel landing page** — public home page showcasing rotating images before login
- **User authentication** — sign up, log in, log out, and reset your password via AWS Cognito
- **Per-user meme history** — every meme you create is saved to your account in DynamoDB
- **Delete memes** — remove any past meme from your history (also deletes the image from S3)
- **Download memes** — save generated memes from both the generator and the My Memes page

## Architecture

```
                          ┌──────────────────────────┐
                          │  AWS Cognito User Pool    │
                          │  (auth / JWT issuance)    │
                          └──────────────────────────┘
                                      ▲  ▼ (browser SDK)
┌─────────────────────┐               │              ┌───────────────────────┐
│  React + Vite SPA   │ ── JWT + form/JSON ────────► │  API Gateway (HTTP)   │
│  (frontend/)        │ ◄──── response ─────────────  │  → Lambda (FastAPI)   │
└─────────────────────┘                              └───────────────────────┘
                                                              │         │
                                                       S3 bucket    DynamoDB
                                                     (images, stock,  (meme
                                                       carousel)    records)
```

- **Frontend** — a React/TypeScript SPA (Vite) with client-side routing. Public routes: landing page (`/apps`) with a carousel, login, signup, and forgot-password. Protected routes: meme generator (`/`) and meme history (`/my-memes`). Authenticates directly with Cognito from the browser; attaches the resulting JWT as a `Bearer` token on every backend API call.
- **Backend** — a FastAPI app with JWT verification (via `auth.py`) and DynamoDB persistence (via `db.py`). All meme-creation endpoints require a valid Cognito ID token. Two versions exist, differing only in where files are stored:
  - `backend/app.py` — local dev. Saves images to disk, reads stock/carousel photos from local folders, reads DynamoDB via `boto3` with local AWS credentials.
  - `backend/lambda_function.py` — AWS production. Reads/writes images from S3, deployed as a Lambda function behind API Gateway via [Mangum](https://github.com/jordaneremieff/mangum).

## File reference

### Backend (`backend/`)

| File | Purpose |
|---|---|
| `app.py` | Local FastAPI server. Defines all endpoints (see list below), loads fonts, processes images with Pillow, saves to `generated/`, and serves static dirs at `/generated`, `/stock-photo-assets`, and `/carousel-photo-assets`. Also loads env vars from `.env` via `python-dotenv`. |
| `lambda_function.py` | AWS Lambda variant. Identical endpoint logic but reads/writes all images (generated, stock, carousel) from S3 prefixes in `GENERATED_BUCKET` instead of local disk. Wrapped with Mangum. |
| `auth.py` | FastAPI dependency used by all protected endpoints. Fetches Cognito's public JWKS, verifies the incoming `Authorization: Bearer <token>` header, and returns the user's `sub` (unique ID). |
| `db.py` | DynamoDB helpers: `put_meme`, `list_memes_for_user`, `delete_meme`. Used by `app.py` and `lambda_function.py` to persist meme records keyed by `user_id` + `meme_id`. |
| `fonts/DejaVuSans-Bold.ttf` | Bundled caption font (Lambda has no system fonts). |
| `generated/` | Local output dir for memes (gitignored except `.gitkeep`). |
| `stock_photos/` | Built-in stock photo images for local dev. Mirrored in production under the `stock/` S3 prefix. |
| `carousel_photos/` | Images shown in the home page carousel for local dev. Mirrored in production under the `carousel/` S3 prefix. |
| `.env` | Local-only env vars (gitignored). Copy from `.env.example` and fill in. |
| `.env.example` | Template for required local env vars. |
| `requirements.txt` | Local dev dependencies (`fastapi`, `uvicorn`, `pillow`, `python-multipart`, `python-dotenv`, `boto3`, `pyjwt[crypto]`). |
| `requirements-lambda.txt` | Lambda deployment dependencies (`fastapi`, `mangum`, `python-multipart`, `pyjwt[crypto]`; boto3/Pillow come from the Lambda runtime/layer). |
| `lambda_package/`, `lambda_package.zip` | Vendored deps and deployment artifact for Lambda. Not needed for local dev. |

### API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/stock-photo-assets` | No | List available stock photos |
| `GET` | `/carousel-photo-assets` | No | List carousel images for the home page |
| `POST` | `/generate` | **Yes** | Generate a meme from an uploaded image or `stock_photo_id`; saves record to DynamoDB |
| `GET` | `/memes` | **Yes** | List the current user's past memes from DynamoDB |
| `DELETE` | `/memes/{meme_id}` | **Yes** | Delete a meme record from DynamoDB and its image from S3/disk |

### Frontend (`frontend/`)

| File | Purpose |
|---|---|
| `src/main.tsx` | App entry point. |
| `src/App.tsx` | Root component. Sets up `AuthProvider`, `BrowserRouter`, the `NavBar`, route definitions, and the `Carousel` + `HomePage` components for the public landing page. |
| `src/auth/AuthContext.tsx` | Cognito auth wrapper (using `amazon-cognito-identity-js`). Exposes `signUp`, `confirmSignUp`, `login`, `logout`, `forgotPassword`, `confirmForgotPassword`, and the current `idToken` to the whole app via React context. |
| `src/auth/ProtectedRoute.tsx` | Redirects unauthenticated users to `/login` for any route that requires a session. |
| `src/components/MemeGenerator.tsx` | The meme creation UI: image upload or stock photo selection, top/bottom text inputs, generates a meme via `POST /generate` with the user's JWT attached, displays the result with a download link. |
| `src/components/StockPhotoPicker.tsx` | Fetches `GET /stock-photo-assets` and renders a clickable thumbnail grid. Also exports `resolveApiUrl` (converts relative backend paths to absolute URLs). |
| `src/components/MyMemes.tsx` | Fetches `GET /memes` and renders the user's past memes in a grid, each with a download link and a delete button. |
| `src/components/Login.tsx` | Login form. |
| `src/components/Signup.tsx` | Two-step signup form: email/password, then Cognito confirmation code. |
| `src/components/ForgotPassword.tsx` | Two-step password reset: request code, then submit code + new password. |
| `src/lib/api.ts` | `authFetch` helper — wraps `fetch` to prepend `VITE_API_BASE` and attach `Authorization: Bearer <token>`. |
| `src/index.css` | All page styling. |
| `.env` | Local dev env vars (`VITE_API_BASE`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`). |
| `.env.production` | Production build env vars (same keys, prod values). Used automatically by `npm run build`. |
| `.env.example` | Template for required env vars. |
| `vite.config.ts` | Vite config — sets `base: '/apps/'`, defines `global: 'globalThis'` polyfill for `amazon-cognito-identity-js`. |

## Running locally

Requires Python 3.11+, Node.js 18+, and AWS credentials configured locally (used by `boto3` to reach Cognito's JWKS endpoint, DynamoDB, and optionally S3).

### 1. AWS credentials

The backend needs AWS credentials at runtime to call DynamoDB. Export them before starting the server:

```bash
eval "$(aws configure export-credentials --format env)"
```

Your IAM user also needs `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:DeleteItem`, and `dynamodb:GetItem` on the dev DynamoDB table.

### 2. Backend env vars

Copy `backend/.env.example` to `backend/.env` and fill in:

```
COGNITO_USER_POOL_ID=us-east-2_XXXXXXXXX
COGNITO_CLIENT_ID=<your dev app client id>
COGNITO_REGION=us-east-2
MEMES_TABLE_NAME=memes-dev
```

### 3. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173/apps/`. It reads `VITE_API_BASE` and the Cognito vars from `frontend/.env`.

## AWS deployment

### AWS resources required

| Resource | Purpose |
|---|---|
| S3 bucket (`GENERATED_BUCKET`) | Stores generated memes, stock photos (`stock/` prefix), and carousel images (`carousel/` prefix) |
| S3 bucket (frontend) | Hosts the built React app as a static website |
| API Gateway (HTTP API) | Routes requests to the Lambda; CORS configured at API level with `Authorization` in allowed headers |
| Lambda function | Runs `lambda_function.py` via Mangum |
| Lambda execution role | Needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on `GENERATED_BUCKET`; and `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:DeleteItem`, `dynamodb:GetItem` on the memes table |
| Cognito User Pool + App Client | Handles signup, login, logout, and password reset (public/SPA client, no secret) |
| DynamoDB table | `memes-prod` — partition key `user_id` (String), sort key `meme_id` (String), on-demand capacity |

### Lambda environment variables

| Key | Value |
|---|---|
| `GENERATED_BUCKET` | S3 bucket name for images |
| `COGNITO_USER_POOL_ID` | Prod Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | Prod Cognito App Client ID |
| `COGNITO_REGION` | `us-east-2` |
| `MEMES_TABLE_NAME` | `memes-prod` |

### Deployment steps (manual)

**Backend:**

```bash
cd backend
rm -rf lambda_package && mkdir lambda_package

# Install Linux-compatible wheels (critical for compiled deps like cryptography/pyjwt)
pip install \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  --target lambda_package/ \
  -r requirements-lambda.txt

cp lambda_function.py lambda_package/
cp auth.py lambda_package/
cp db.py lambda_package/
cp -r fonts/ lambda_package/fonts/

cd lambda_package && zip -r ../lambda_package.zip . && cd ..
aws lambda update-function-code --function-name <function-name> \
  --zip-file fileb://lambda_package.zip --region us-east-2
```

**Seed image libraries (run once, or when images change):**

```bash
aws s3 sync backend/stock_photos/    s3://<bucket>/stock/    --region us-east-2
aws s3 sync backend/carousel_photos/ s3://<bucket>/carousel/ --region us-east-2
```

**Frontend:**

`npm run build` automatically uses `frontend/.env.production` (prod Cognito + API Gateway URL):

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://<frontend-bucket-name> --region us-east-2
```
