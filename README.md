# NarouCast

Fetch, translate, and voice Syosetu web novel chapters to polished Polish.  
Node.js CLI that scrapes chapters, translates them via DeepSeek, OpenAI, or Google Translate, saves Markdown, and optionally generates MP3 audio via OpenAI, or Google TTS, 

---

## Features

- Pulls title and body from a given Syosetu chapter URL
- Translates to Polish with provider: DeepSeek, OpenAI, or Google Translate
- Preserves tone (configurable style hints and glossary)
- Saves each chapter as Markdown with front matter
- Follows “Next” to process subsequent chapters automatically
- Text-to-Speech: produces MP3 per chapter with provider: OpenAI, or Google TTS


---

Legal & ethics
•Use responsibly. Scraping and automated translation may be restricted by the source site’s Terms of Service and local law.
•This tool is intended for personal, non-commercial use. Respect original authors and rights holders.
•Do not distribute or publicly share translated texts or audio files produced by this application. Outputs are intended for private, personal use only.
•This project is an independent tool and is not affiliated with or endorsed by the original site or its authors.

⸻

Acknowledgements & provenance
•Parts of this project, including translation workflow design and initial prototyping, were created with the assistance of Claude Code, leveraging DeepSeek 3.1 for translation experiments and integration design.
•Translation engines used at runtime may include DeepSeek, OpenAI, and Google Translate per configuration.