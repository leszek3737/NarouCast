export const AVAILABLE_VOICES = [
  // OpenAI voices
  { id: 'alloy', name: 'Alloy', language: 'pl', gender: 'female', provider: 'openai' },
  { id: 'echo', name: 'Echo', language: 'pl', gender: 'male', provider: 'openai' },
  { id: 'fable', name: 'Fable', language: 'pl', gender: 'female', provider: 'openai' },
  { id: 'onyx', name: 'Onyx', language: 'pl', gender: 'male', provider: 'openai' },
  { id: 'nova', name: 'Nova', language: 'pl', gender: 'female', provider: 'openai' },
  { id: 'shimmer', name: 'Shimmer', language: 'pl', gender: 'female', provider: 'openai' },

  // Google Cloud TTS voices
  { id: 'pl-PL-Wavenet-A', name: 'Polish Female A', language: 'pl-PL', gender: 'female', provider: 'google' },
  { id: 'pl-PL-Wavenet-B', name: 'Polish Female B', language: 'pl-PL', gender: 'female', provider: 'google' },
  { id: 'pl-PL-Wavenet-C', name: 'Polish Male C', language: 'pl-PL', gender: 'male', provider: 'google' },
  { id: 'pl-PL-Wavenet-D', name: 'Polish Male D', language: 'pl-PL', gender: 'male', provider: 'google' },
  { id: 'pl-PL-Standard-A', name: 'Polish Standard A', language: 'pl-PL', gender: 'female', provider: 'google' },
  { id: 'pl-PL-Standard-B', name: 'Polish Standard B', language: 'pl-PL', gender: 'female', provider: 'google' },
  { id: 'pl-PL-Standard-C', name: 'Polish Standard C', language: 'pl-PL', gender: 'male', provider: 'google' },
  { id: 'pl-PL-Standard-D', name: 'Polish Standard D', language: 'pl-PL', gender: 'male', provider: 'google' }
];

export const TRANSLATOR_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'Tłumaczenie za pomocą modeli OpenAI' },
  { id: 'google', name: 'Google Translate', description: 'Tłumaczenie przez Google Cloud Translate' },
  { id: 'deepseek', name: 'DeepSeek', description: 'Tłumaczenie przez DeepSeek API' }
];

export const TTS_PROVIDERS = [
  { id: 'openai', name: 'OpenAI TTS', description: 'Wysokiej jakości głosy od OpenAI' },
  { id: 'google', name: 'Google Cloud TTS', description: 'Głosy Google Cloud z obsługą SSML' },
  { id: 'none', name: 'Wyłączone', description: 'Bez generowania audio' }
];