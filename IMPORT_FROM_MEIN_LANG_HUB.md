# Importing Texts From Mein Lang Hub

This document explains how another website/app can trigger imports from **Mein Lang Hub** into its own API.

## 1) Enable import mode with URL params

Open Mein Lang Hub with these query params:

- `importApiEndpoint` (required): API endpoint that receives multipart uploads
- `importAuthRequired` (optional): `true` or `false` (default: `true`)
- `importTag` (optional): comma-separated tags override

Example:

```text
https://abdelzadel.github.io/MeinLang-Hub/?importApiEndpoint=https%3A%2F%2Fyour-app.com%2Fapp%2Fapi%2Fexternal-import%2Ftexts&importAuthRequired=true&importTag=A1,News
```

If `importApiEndpoint` is missing, subfolder import buttons are hidden/disabled.

## 2) User flow in UI

1. User opens a language.
2. User opens subfolders.
3. On each subfolder card, user clicks **Import texts**.
4. A popup appears with:
   - Email + password fields (if `importAuthRequired=true`)
   - Terms and conditions checkbox (required)
   - Submit button
5. On submit, a loader is shown while uploading.

## 3) Request format sent by Mein Lang Hub

Method: `POST`
Content-Type: `multipart/form-data`

Fields sent:

- `email` (when auth is required)
- `password` (when auth is required)
- `language` (selected language, formatted)
- `subfolder` (selected subfolder path)
- `tag` (from `importTag` param or auto-generated)
- `files` (one part per `.txt` file in that subfolder)

Equivalent curl shape:

```bash
curl -X POST "{api end point}" \
  -F "email=user@example.com" \
  -F "password=your_password" \
  -F "language=French" \
  -F "subfolder=news/a1" \
  -F "tag=A1,News" \
  -F "files=@/absolute/path/article1.txt" \
  -F "files=@/absolute/path/article2.txt"
```

## 4) Endpoint used in `/Users/mac/Desktop/coding/reading`

In the Reading app, the import endpoint is:

```text
/app/api/external-import/texts
```

It expects multipart fields compatible with the format above and supports CORS for external requests.

## 5) Integration notes

- Ensure your endpoint allows CORS from the Hub origin.
- Return JSON with success/error so the popup can show feedback.
- Keep file size limits aligned with your backend limits.
