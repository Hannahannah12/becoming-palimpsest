/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
# Becoming Palimpsest (2025)

**Becoming Palimpsest** is an interactive artwork created by Xiaohan Sun in 2025. It stages an AI-generated philosophical encounter between Henri Bergson and Gilles Deleuze. Body detection is performed locally in the visitor's browser, and dialogue screenshots are downloaded to the visitor's device.

## Privacy and API architecture

- Camera frames are processed locally by BodyPix and are not uploaded by this project.
- Screenshots are downloaded locally and are not sent to cloud storage.
- Dialogue text is sent through same-origin serverless endpoints to OpenAI and DeepSeek.
- API credentials exist only as deployment environment variables and must never be committed.

## Deploy with Vercel

1. Import this GitHub repository into Vercel.
2. Add `OPENAI_API_KEY` and `DEEPSEEK_API_KEY` under Project Settings → Environment Variables.
3. Optionally set `OPENAI_MODEL` and `DEEPSEEK_MODEL`.
4. Deploy, then add the deployment URL to the artwork's portfolio page.

Before adding new keys, revoke every credential that previously appeared in browser code or source files. Configure provider spending limits and Vercel firewall/rate-limiting rules before a public exhibition.
