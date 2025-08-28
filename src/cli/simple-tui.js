#!/usr/bin/env node

import fs from 'fs';
import inquirer from 'inquirer';
import { ConfigManager } from '../shared/config-manager.js';
import {
  TRANSLATOR_PROVIDERS,
  TTS_PROVIDERS,
  AVAILABLE_VOICES,
} from '../tui/utils/voices.js';

const configManager = new ConfigManager();

async function runTUI() {
  console.log('🚀 Syosetu Translator - Konfiguracja\n');

  let config = await configManager.loadConfig();

  const questions = [
    {
      type: 'list',
      name: 'translatorProvider',
      message: 'Wybierz providera tłumaczenia:',
      choices: TRANSLATOR_PROVIDERS.map((p) => ({ name: p.name, value: p.id })),
      default: config?.translator?.provider || 'openai',
    },
    {
      type: 'password',
      name: 'translatorApiKey',
      message: 'Wprowadź klucz API:',
      default: config?.translator?.apiKey || '',
      mask: '*',
    },
    {
      type: 'list',
      name: 'ttsProvider',
      message: 'Wybierz providera TTS:',
      choices: TTS_PROVIDERS.map((p) => ({ name: p.name, value: p.id })),
      default: config?.tts?.provider || 'none',
    },
  ];

  // Add voice selection if TTS is enabled
  const answers = await inquirer.prompt(questions);

  if (answers.ttsProvider !== 'none') {
    const voiceQuestion = {
      type: 'list',
      name: 'ttsVoice',
      message: 'Wybierz głos:',
      choices: AVAILABLE_VOICES.filter(
        (v) => v.provider === answers.ttsProvider,
      ).map((v) => ({
        name: `${v.name} (${v.language}, ${v.gender})`,
        value: v.id,
      })),
      default: config?.tts?.voice || '',
    };

    const speedQuestion = {
      type: 'number',
      name: 'ttsSpeed',
      message: 'Prędkość czytania (0.25 - 4.0):',
      default: config?.tts?.speed || 1.0,
      validate: (value) =>
        (value >= 0.25 && value <= 4.0) ||
        'Prędkość musi być między 0.25 a 4.0',
    };

    const audioDirQuestion = {
      type: 'input',
      name: 'audioDir',
      message: 'Katalog wyjściowy dla audio:',
      default: config?.output?.audioDirectory || './audio',
    };

    // Auto-detect Google credentials file if only one JSON file exists
    let defaultGoogleCreds = config?.google?.credentialsPath || '';
    if (!defaultGoogleCreds) {
      try {
        const files = await fs.promises.readdir('.');
        const jsonFiles = files.filter((file) => file.endsWith('.json'));
        if (jsonFiles.length === 1) {
          defaultGoogleCreds = `./${jsonFiles[0]}`;
          console.log(
            `📁 Automatycznie wykryto plik credentials: ${defaultGoogleCreds}`,
          );
        }
      } catch (error) {
        // Ignore errors
      }
    }

    const ttsAnswers = await inquirer.prompt([
      voiceQuestion,
      speedQuestion,
      audioDirQuestion,
    ]);
    Object.assign(answers, ttsAnswers);
  }

  // Add remaining questions
  const remainingQuestions = [
    {
      type: 'input',
      name: 'googleCredentialsPath',
      message:
        'Ścieżka do pliku credentials Google (GOOGLE_APPLICATION_CREDENTIALS):',
      default:
        config?.google?.credentialsPath || '/tmp/google-service-account.json',
      when: (_allAnswers) => answers.ttsProvider === 'google',
    },
    {
      type: 'input',
      name: 'outputDir',
      message: 'Katalog wyjściowy dla tłumaczeń:',
      default: config?.output?.directory || './output',
    },
    {
      type: 'confirm',
      name: 'autoContinue',
      message: 'Automatycznie kontynuować tłumaczenie?',
      default: config?.general?.autoContinue !== false,
    },
    {
      type: 'number',
      name: 'chapterDelay',
      message: 'Opóźnienie między rozdziałami (sekundy):',
      default: config?.general?.chapterDelay || 3,
    },
    {
      type: 'number',
      name: 'maxChapters',
      message: 'Maksymalna liczba rozdziałów do przetłumaczenia:',
      default: config?.general?.maxChapters || 1000,
    },
  ];

  const remainingAnswers = await inquirer.prompt(remainingQuestions);
  Object.assign(answers, remainingAnswers);

  const newConfig = {
    translator: {
      provider: answers.translatorProvider,
      apiKey: answers.translatorApiKey,
    },
    tts:
      answers.ttsProvider !== 'none'
        ? {
            provider: answers.ttsProvider,
            voice: answers.ttsVoice,
            speed: parseFloat(answers.ttsSpeed),
          }
        : { provider: 'none' },
    output: {
      directory: answers.outputDir,
      audioDirectory: answers.audioDir,
    },
    general: {
      autoContinue: answers.autoContinue,
      chapterDelay: parseInt(answers.chapterDelay),
      maxChapters: parseInt(answers.maxChapters),
    },
  };

  // Add Google credentials path if provided
  if (answers.googleCredentialsPath) {
    newConfig.google = {
      credentialsPath: answers.googleCredentialsPath,
    };
  }

  await configManager.saveConfig(newConfig);
  console.log('\n✅ Konfiguracja zapisana pomyślnie!');
  console.log('\nUruchom aplikację z odpowiednimi parametrami:');
  console.log('npm start -- --url "URL_DO_NOVELI"');
}

runTUI().catch(console.error);
