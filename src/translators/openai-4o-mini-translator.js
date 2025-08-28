import fetch from 'node-fetch';
import { APP_CONSTANTS } from '../shared/constants.js';

export class OpenAI4oMiniTranslator {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.config = {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      maxTokens: APP_CONSTANTS.TRANSLATION_MAX_TOKENS,
      temperature: APP_CONSTANTS.TRANSLATION_TEMPERATURE,
      ...config,
    };
  }

  async translateChapter(title, content) {
    try {
      console.log('Tłumaczenie rozdziału za pomocą OpenAI...');

      const translatedTitle = await this.translateText(title, 'title');
      const translatedContent = await this.translateText(content, 'content');

      return {
        title: translatedTitle,
        content: translatedContent,
      };
    } catch (error) {
      throw new Error(`Błąd tłumaczenia OpenAI: ${error.message}`);
    }
  }

  async translateText(text, type = 'content') {
    const prompt = this.buildPrompt(text, type);

    const requestBody = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content:
            'Jesteś profesjonalnym tłumaczem literatury japońskiej na język polski. Twoim zadaniem jest przetłumaczenie tekstu zachowując oryginalny ton, styl i nastrój wypowiedzi. Nie dodawaj żadnych komentarzy ani wyjaśnień - zwracaj tylko przetłumaczony tekst.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false,
    };

    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API Error ${response.status}: ${errorData}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('Brak odpowiedzi z API');
    }

    return data.choices[0].message.content.trim();
  }

  buildPrompt(text, type) {
    if (type === 'title') {
      return `Przetłumacz następujący tytuł rozdziału japońskiej powieści webowej na język polski, zachowując jego znaczenie i charakter:

"${text}"

Zwróć tylko przetłumaczony tytuł bez żadnych dodatkowych komentarzy.`;
    }

    return `Przetłumacz następujący fragment japońskiej powieści webowej na język polski. Zachowaj:
- Oryginalny ton i styl wypowiedzi
- Charakterystykę postaci
- Nastrój sceny
- Naturalne brzmienie w języku polskim
- Podział na akapity

Tekst do tłumaczenia:

${text}

Zwróć tylko przetłumaczony tekst bez żadnych dodatkowych komentarzy.`;
  }

  static validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Brak lub nieprawidłowy klucz API OpenAI');
    }

    if (!apiKey.startsWith('sk-')) {
      throw new Error(
        'Nieprawidłowy format klucz API OpenAI (powinien zaczynać się od "sk-")',
      );
    }

    return true;
  }
}
