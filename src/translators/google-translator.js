import fetch from "node-fetch";

export class GoogleTranslator {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.config = {
      apiUrl: "https://translation.googleapis.com/language/translate/v2",
      sourceLanguage: "ja",
      targetLanguage: "pl",
      ...config,
    };
  }

  async translateChapter(title, content) {
    try {
      console.log("Tłumaczenie rozdziału za pomocą Google Translate...");

      const translatedTitle = await this.translateText(title);
      const translatedContent = await this.translateText(content);

      return {
        title: translatedTitle,
        content: translatedContent,
      };
    } catch (error) {
      throw new Error(`Błąd tłumaczenia Google: ${error.message}`);
    }
  }

  async translateText(text) {
    const response = await fetch(`${this.config.apiUrl}?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        source: this.config.sourceLanguage,
        target: this.config.targetLanguage,
        format: "text",
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API Error ${response.status}: ${errorData}`);
    }

    const data = await response.json();

    if (
      !data.data ||
      !data.data.translations ||
      data.data.translations.length === 0
    ) {
      throw new Error("Brak tłumaczenia w odpowiedzi API");
    }

    return data.data.translations[0].translatedText;
  }

  static validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Brak lub nieprawidłowy klucz API Google Translate");
    }

    return true;
  }
}
