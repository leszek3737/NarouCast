import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { google } from 'googleapis';

export class GoogleCloudTTS {
  constructor(keyFilename = null) {
    this.keyFilename = keyFilename;
    this.initializeClient();
    this.availableVoices = [
      'pl-PL-Chirp3-HD-Achernar','pl-PL-Chirp3-HD-Achird','pl-PL-Chirp3-HD-Algenib','pl-PL-Chirp3-HD-Algieba',
      'pl-PL-Chirp3-HD-Alnilam','pl-PL-Chirp3-HD-Aoede','pl-PL-Chirp3-HD-Autonoe','pl-PL-Chirp3-HD-Callirrhoe',
      'pl-PL-Chirp3-HD-Charon','pl-PL-Chirp3-HD-Despina','pl-PL-Chirp3-HD-Enceladus','pl-PL-Chirp3-HD-Erinome',
      'pl-PL-Chirp3-HD-Fenrir','pl-PL-Chirp3-HD-Gacrux','pl-PL-Chirp3-HD-Iapetus','pl-PL-Chirp3-HD-Kore',
      'pl-PL-Chirp3-HD-Laomedeia','pl-PL-Chirp3-HD-Leda','pl-PL-Chirp3-HD-Orus','pl-PL-Chirp3-HD-Puck',
      'pl-PL-Chirp3-HD-Pulcherrima','pl-PL-Chirp3-HD-Rasalgethi','pl-PL-Chirp3-HD-Sadachbia','pl-PL-Chirp3-HD-Sadaltager',
      'pl-PL-Chirp3-HD-Schedar','pl-PL-Chirp3-HD-Sulafat','pl-PL-Chirp3-HD-Umbriel','pl-PL-Chirp3-HD-Vindemiatrix',
      'pl-PL-Chirp3-HD-Zephyr','pl-PL-Chirp3-HD-Zubenelgenubi','pl-PL-Standard-F','pl-PL-Standard-G','pl-PL-Wavenet-F',
      'pl-PL-Wavenet-G	MALE'
    ];
    this.defaultVoice = 'pl-PL-Wavenet-A';
  }

  static validateCredentials(keyFilename = null) {
    // Sprawdzamy czy mamy jakiekolwiek credentials
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !keyFilename) {
      throw new Error('Google Cloud TTS wymaga pliku credentials. Ustaw GOOGLE_APPLICATION_CREDENTIALS lub podaj ścieżkę do pliku credentials');
    }
  }

  async initializeClient() {
    try {
      this.client = new TextToSpeechClient(this.keyFilename ? { keyFilename: this.keyFilename } : {});
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
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      
      const authClient = await auth.getClient();
      this.client = new TextToSpeechClient({ auth: authClient });
    } catch (error) {
      throw new Error(`Nie udało się zainicjalizować Google Cloud TTS: ${error.message}`);
    }
  }

  async synthesizeSpeech(text, options = {}) {
    const voice = options.voice || this.defaultVoice;
    const speakingRate = options.speakingRate || 1.0;
    const pitch = options.pitch || 0.0;
    
    if (!this.availableVoices.includes(voice)) {
      throw new Error(`Nieprawidłowy głos: ${voice}. Dostępne głosy: ${this.availableVoices.join(', ')}`);
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return Buffer.concat(audioBuffers);
  }

  splitTextIntoChunks(text, maxChunkSize) {
    if (text.length <= maxChunkSize) {
      return [text];
    }
    
    const chunks = [];
    let currentChunk = '';
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      const sentenceWithPunctuation = trimmedSentence + '.';
      
      if (currentChunk.length + sentenceWithPunctuation.length <= maxChunkSize) {
        currentChunk += (currentChunk ? ' ' : '') + sentenceWithPunctuation;
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
    return this.availableVoices.map(voice => ({
      id: voice,
      name: voice.replace('pl-PL-', '').replace('-', ' '),
      language: 'pl-PL',
      provider: 'google',
      gender: voice.includes('A') || voice.includes('B') ? 'female' : 'male'
    }));
  }
}