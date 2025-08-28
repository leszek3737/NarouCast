import { AudioWriter } from './audio-writer.js';

export class TTSManager {
  constructor(options = {}) {
    this.provider = options.provider || 'none';
    this.voice = options.voice;
    this.audioDir = options.audioDir || './audio';
    this.speed = options.speed || 1.0;
    this.openaiApiKey = options.openaiApiKey;
    this.googleCredentials = options.googleCredentials;

    this.ttsEngine = null;
    this.audioWriter = new AudioWriter(this.audioDir);
    this._initialized = false;
    this._initPromise = null;
  }

  async ensureInitialized() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;
    
    this._initPromise = this.initializeTTSEngine();
    await this._initPromise;
    this._initialized = true;
  }

  async initializeTTSEngine() {
    const provider = this.provider.toLowerCase();

    switch (provider) {
      case 'openai': {
        const { OpenAITTS } = await import('./openai-tts.js');
        OpenAITTS.validateApiKey(this.openaiApiKey);
        this.ttsEngine = new OpenAITTS(this.openaiApiKey);
        break;
      }
      case 'google': {
        const { GoogleCloudTTS } = await import('./google-cloud-tts.js');
        GoogleCloudTTS.validateCredentials(this.googleCredentials);
        this.ttsEngine = new GoogleCloudTTS(this.googleCredentials);
        break;
      }
      case 'none':
      default:
        this.ttsEngine = null;
        break;
    }
  }

  async isEnabled() {
    await this.ensureInitialized();
    return this.ttsEngine !== null;
  }

  async generateChapterAudio(chapterData, options = {}) {
    if (!(await this.isEnabled())) {
      return null;
    }

    console.log(`🔊 Generowanie audio dla: ${chapterData.title}`);

    const ttsOptions = {
      voice: this.voice,
      speed: this.speed,
      speakingRate: this.speed,
      ...options,
    };

    try {
      let audioBuffer = await this.ttsEngine.generateAudio(
        chapterData.title,
        chapterData.content,
        ttsOptions,
      );

      const audioFileInfo = await this.audioWriter.writeAudioChapter(
        audioBuffer,
        chapterData.seriesId,
        chapterData.chapterNumber,
        chapterData.title,
        this.speed,
      );

      // Force buffer cleanup to prevent memory leaks
      audioBuffer = null;
      
      // Trigger manual garbage collection if available
      if (global.gc && audioFileInfo.sizeMB > 10) {
        console.log(`🧹 Forcing GC after ${audioFileInfo.sizeMB} MB audio generation`);
        global.gc();
      }

      console.log(
        `✓ Audio zapisane: ${audioFileInfo.path} (${audioFileInfo.sizeMB} MB)`,
      );
      return audioFileInfo.path;
    } catch (error) {
      console.error(`❌ Błąd generowania audio: ${error.message}`);
      throw error;
    }
  }

  async getAvailableVoices() {
    if (!(await this.isEnabled())) {
      return [];
    }
    return this.ttsEngine.getAvailableVoices();
  }

  static getSupportedProviders() {
    return [
      {
        id: 'openai',
        name: 'OpenAI TTS',
        description: 'Wysokiej jakości głosy od OpenAI',
      },
      {
        id: 'google',
        name: 'Google Cloud TTS',
        description: 'Głosy Google Cloud z obsługą SSML',
      },
      {
        id: 'none',
        name: 'Wyłączone',
        description: 'Bez generowania audio',
      },
    ];
  }

  static validateConfiguration(provider, options = {}) {
    switch (provider.toLowerCase()) {
      case 'openai':
        if (!options.openaiApiKey && !process.env.OPENAI_API_KEY) {
          throw new Error('OpenAI API key jest wymagany dla TTS');
        }
        break;
      case 'google':
        if (
          !options.googleCredentials &&
          !process.env.GOOGLE_APPLICATION_CREDENTIALS
        ) {
          throw new Error('Google Cloud credentials są wymagane dla TTS');
        }
        break;
      case 'none':
        break;
      default:
        throw new Error(`Nieobsługiwany provider TTS: ${provider}`);
    }
  }
}
