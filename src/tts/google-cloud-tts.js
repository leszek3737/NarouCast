import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { google } from 'googleapis';

export class GoogleCloudTTS {
  constructor(keyFilename = null) {
    this.keyFilename = keyFilename;
    this.initializeClient();
    this.availableVoices = [
      'pl-PL-Chirp3-HD-Achernar',
      'pl-PL-Chirp3-HD-Achird',
      'pl-PL-Chirp3-HD-Algenib',
      'pl-PL-Chirp3-HD-Algieba',
      'pl-PL-Chirp3-HD-Alnilam',
      'pl-PL-Chirp3-HD-Aoede',
      'pl-PL-Chirp3-HD-Autonoe',
      'pl-PL-Chirp3-HD-Callirrhoe',
      'pl-PL-Chirp3-HD-Charon',
      'pl-PL-Chirp3-HD-Despina',
      'pl-PL-Chirp3-HD-Enceladus',
      'pl-PL-Chirp3-HD-Erinome',
      'pl-PL-Chirp3-HD-Fenrir',
      'pl-PL-Chirp3-HD-Gacrux',
      'pl-PL-Chirp3-HD-Iapetus',
      'pl-PL-Chirp3-HD-Kore',
      'pl-PL-Chirp3-HD-Laomedeia',
      'pl-PL-Chirp3-HD-Leda',
      'pl-PL-Chirp3-HD-Orus',
      'pl-PL-Chirp3-HD-Puck',
      'pl-PL-Chirp3-HD-Pulcherrima',
      'pl-PL-Chirp3-HD-Rasalgethi',
      'pl-PL-Chirp3-HD-Sadachbia',
      'pl-PL-Chirp3-HD-Sadaltager',
      'pl-PL-Chirp3-HD-Schedar',
      'pl-PL-Chirp3-HD-Sulafat',
      'pl-PL-Chirp3-HD-Umbriel',
      'pl-PL-Chirp3-HD-Vindemiatrix',
      'pl-PL-Chirp3-HD-Zephyr',
      'pl-PL-Chirp3-HD-Zubenelgenubi',
      'pl-PL-Standard-F',
      'pl-PL-Standard-G',
      'pl-PL-Wavenet-F',
      'pl-PL-Wavenet-G	MALE',
    ];
    this.defaultVoice = 'pl-PL-Wavenet-A';
  }

  static validateCredentials(keyFilename = null) {
    // Sprawdzamy czy mamy jakiekolwiek credentials
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !keyFilename) {
      throw new Error(
        'Google Cloud TTS wymaga pliku credentials. Ustaw GOOGLE_APPLICATION_CREDENTIALS lub podaj ścieżkę do pliku credentials',
      );
    }
  }

  async initializeClient() {
    try {
      this.client = new TextToSpeechClient(
        this.keyFilename ? { keyFilename: this.keyFilename } : {},
      );
    } catch (error) {
      // Fallback: spróbuj użyć OAuth2 jeśli Service Account nie działa
      console.warn('Service Account nie działa, próbuję OAuth2...');
      await this.initializeOAuthClient();
    }
  }

  async initializeOAuthClient() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: this.keyFilename,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const authClient = await auth.getClient();
      this.client = new TextToSpeechClient({ auth: authClient });
    } catch (error) {
      throw new Error(
        `Nie udało się zainicjalizować Google Cloud TTS: ${error.message}`,
      );
    }
  }

  async synthesizeSpeech(text, options = {}) {
    const voice = options.voice || this.defaultVoice;
    const speakingRate = options.speakingRate || 1.0;
    const pitch = options.pitch || 0.0;

    if (!this.availableVoices.includes(voice)) {
      throw new Error(
        `Nieprawidłowy głos: ${voice}. Dostępne głosy: ${this.availableVoices.join(', ')}`,
      );
    }

    const request = {
      input: { text: text },
      voice: {
        languageCode: 'pl-PL',
        name: voice,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speakingRate,
        pitch: pitch,
      },
    };

    try {
      const [response] = await this.client.synthesizeSpeech(request);
      return response.audioContent;
    } catch (error) {
      throw new Error(`Google Cloud TTS API error: ${error.message}`);
    }
  }

  async generateAudio(title, content, options = {}) {
    const combinedText = `${title}. ${content}`;

    // Google Cloud TTS ma limit ~4000 bajtów (bezpieczniejszy limit)
    const maxChunkSize = 3500;
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
    if (Buffer.byteLength(text, 'utf8') <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    let currentChunk = '';
    // Dziel na zdania i linie - uwzględnij nowe linie jako separatory
    const sentences = text.split(/[.!?\n]+/);

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const sentenceWithPunctuation = trimmedSentence + '.';

      // Jeśli zdanie jest za długie (>900 bajtów), podziel je na mniejsze części
      if (Buffer.byteLength(sentenceWithPunctuation, 'utf8') > 900) {
        const splitSentences = this.splitLongSentence(
          sentenceWithPunctuation,
          900,
        );

        for (const splitSentence of splitSentences) {
          const testChunk = currentChunk
            ? `${currentChunk} ${splitSentence}`
            : splitSentence;
          if (Buffer.byteLength(testChunk, 'utf8') <= maxChunkSize) {
            currentChunk = testChunk;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
            }
            currentChunk = splitSentence;
          }
        }
      } else {
        const testChunk = currentChunk
          ? `${currentChunk} ${sentenceWithPunctuation}`
          : sentenceWithPunctuation;
        if (Buffer.byteLength(testChunk, 'utf8') <= maxChunkSize) {
          currentChunk = testChunk;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = sentenceWithPunctuation;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [text.substring(0, maxChunkSize)];
  }

  splitLongSentence(sentence, maxBytes) {
    const parts = [];
    let currentPart = '';

    // Najpierw spróbuj podzielić na przecinkach (dla list)
    const segments = sentence.split(/,\s+/);

    if (segments.length > 1) {
      // Mamy listę z przecinkami
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i] + (i < segments.length - 1 ? ',' : '.');
        const testPart = currentPart ? `${currentPart} ${segment}` : segment;

        if (Buffer.byteLength(testPart, 'utf8') <= maxBytes) {
          currentPart = testPart;
        } else {
          if (currentPart) {
            parts.push(currentPart + '.');
            currentPart = segment;
          } else {
            // Jeśli pojedynczy segment jest za długi, podziel na słowa
            currentPart = segment;
          }
        }
      }
    } else {
      // Nie ma przecinków, dziel na słowa
      const words = sentence.split(/\s+/);

      for (const word of words) {
        const testPart = currentPart ? `${currentPart} ${word}` : word;

        if (Buffer.byteLength(testPart, 'utf8') <= maxBytes) {
          currentPart = testPart;
        } else {
          if (currentPart) {
            parts.push(currentPart + '.');
            currentPart = word;
          } else {
            // Jeśli pojedyncze słowo jest za długie, przytnij je
            const truncated = this.truncateToBytes(word, maxBytes - 1);
            parts.push(truncated + '.');
            currentPart = '';
          }
        }
      }
    }

    if (currentPart) {
      parts.push(currentPart + '.');
    }

    return parts;
  }

  truncateToBytes(text, maxBytes) {
    let truncated = text;
    while (Buffer.byteLength(truncated, 'utf8') > maxBytes) {
      truncated = truncated.slice(0, -1);
    }
    return truncated;
  }

  getAvailableVoices() {
    return this.availableVoices.map((voice) => ({
      id: voice,
      name: voice.replace('pl-PL-', '').replace('-', ' '),
      language: 'pl-PL',
      provider: 'google',
      gender: voice.includes('A') || voice.includes('B') ? 'female' : 'male',
    }));
  }
}
