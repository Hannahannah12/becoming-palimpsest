# Becoming Palimpsest (2025)

**Becoming Palimpsest** is an interactive artwork created by Xiaohan Sun in 2025. It stages an AI-generated philosophical encounter between Henri Bergson and Gilles Deleuze, exploring memory, duration, difference, and machine-generated time.

## Technical notes

- Body detection and camera processing run locally in the visitor's browser.
- Screenshots are downloaded to the visitor's device and are not uploaded.
- Dialogue requests use secure server-side endpoints for OpenAI and DeepSeek.
- API keys are stored only as deployment environment variables and are never included in this repository.

## Running the work

Import this repository into Vercel, then add `OPENAI_API_KEY` and `DEEPSEEK_API_KEY` in the project's environment variables. Optional model settings are documented in `.env.example`.

## More information

Project page: [xiaohan-sun.com/becoming-palimpsest](https://xiaohan-sun.com/becoming-palimpsest)

## Rights

Copyright © 2025 Xiaohan Sun. All rights reserved.
