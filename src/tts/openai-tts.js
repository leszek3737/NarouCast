import fetch from "node-fetch";

export class OpenAITTS {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.openai.com/v1/audio/speech";
    this.availableVoices = [
      "alloy",
      "echo",
      "fable",
      "onyx",
      "nova",
      "shimmer",
    ];
    this.defaultVoice = "alloy";
    this.model = "tts-1";
  }

  static validateApiKey(apiKey) {
    if (!apiKey) {
      throw new Error(
        "OpenAI API key jest wymagany. Ustaw OPENAI_API_KEY w .env lub podaj --openai-api-key",
      );
    }
  }

  async synthesizeSpeech(text, options = {}) {
    const voice = options.voice || this.defaultVoice;
    const speed = options.speed || 1.0;

    if (!this.availableVoices.includes(voice)) {
      throw new Error(
        `Nieprawidłowy głos: ${voice}. Dostępne głosy: ${this.availableVoices.join(", ")}`,
      );
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: voice,
        speed: speed,
        response_format: "mp3",
        language: "pl",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI TTS API error: ${response.status} - ${errorText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async generateAudio(title, content, options = {}) {
    const combinedText = `${title}. ${content}`;

    // Podziel długi tekst na mniejsze fragmenty (OpenAI ma limit ~4000 znaków)
    const maxChunkSize = 4000;
    const chunks = this.splitTextIntoChunks(combinedText, maxChunkSize);

    if (chunks.length === 1) {
      return await this.synthesizeSpeech(chunks[0], options);
    }

    // Dla wielu fragmentów, połącz audio bufory
    const audioBuffers = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Generowanie audio fragmentu ${i + 1}/${chunks.length}...`);
      const audioBuffer = await this.synthesizeSpeech(chunks[i], options);
      audioBuffers.push(audioBuffer);

      // Dodaj krótką pauzę między fragmentami
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return Buffer.concat(audioBuffers);
  }

  splitTextIntoChunks(text, maxChunkSize) {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    let currentChunk = "";
    const sentences = text.split(/[.!?]+/);

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const sentenceWithPunctuation = trimmedSentence + ".";

      if (
        currentChunk.length + sentenceWithPunctuation.length <=
        maxChunkSize
      ) {
        currentChunk += (currentChunk ? " " : "") + sentenceWithPunctuation;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = sentenceWithPunctuation;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [text.substring(0, maxChunkSize)];
  }

  getAvailableVoices() {
    return this.availableVoices.map((voice) => ({
      id: voice,
      name: voice.charAt(0).toUpperCase() + voice.slice(1),
      language: "pl",
      provider: "openai",
    }));
  }
}
