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
  console.log('=� Syosetu Translator - Konfiguracja\n');

  let config = await configManager.loadConfig();

  const questions = [
    {
      type: 'list',
      name: 'translatorProvider',
      message: 'Wybierz providera tBumaczenia:',
      choices: TRANSLATOR_PROVIDERS.map((p) => ({ name: p.name, value: p.id })),
      default: config?.translator?.provider || 'openai',
    },
    {
      type: 'password',
      name: 'translatorApiKey',
      message: 'Wprowadz klucz API:',
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
      message: 'Wybierz gBos:',
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
      message: 'Prdko[ czytania (0.25 - 4.0):',
      default: config?.tts?.speed || 1.0,
      validate: (value) =>
        (value >= 0.25 && value <= 4.0) ||
        'Prdko[ musi by midzy 0.25 a 4.0',
    };

    const audioDirQuestion = {
      type: 'input',
      name: 'audioDir',
      message: 'Katalog wyj[ciowy dla audio:',
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
            `=� Automatycznie wykryto plik credentials: ${defaultGoogleCreds}`,
          );
        }
      } catch (error) {
        // Ignore errors
      }
    }

    const ttsQuestions = [
      voiceQuestion,
      speedQuestion,
      audioDirQuestion,
    ];

    // Add OpenAI API key question if TTS provider is OpenAI
    if (answers.ttsProvider === 'openai') {
      ttsQuestions.push({
        type: 'password',
        name: 'ttsApiKey',
        message: 'Wprowadź klucz API OpenAI dla TTS:',
        default: config?.tts?.apiKey || '',
        mask: '*',
      });
    }

    const ttsAnswers = await inquirer.prompt(ttsQuestions);
    Object.assign(answers, ttsAnswers);
  }

  // Add remaining questions
  const remainingQuestions = [
    {
      type: 'input',
      name: 'googleCredentialsPath',
      message:
        'Zcie|ka do pliku credentials Google (GOOGLE_APPLICATION_CREDENTIALS):',
      default:
        config?.google?.credentialsPath || '/tmp/google-service-account.json',
      when: (_allAnswers) => answers.ttsProvider === 'google',
    },
    {
      type: 'password',
      name: 'googleTranslatorApiKey',
      message: 'Wprowadź klucz API Google Translate:',
      default: config?.translator?.provider === 'google' ? config?.translator?.apiKey : '',
      mask: '*',
      when: (_allAnswers) => answers.translatorProvider === 'google',
    },
    {
      type: 'input',
      name: 'outputDir',
      message: 'Katalog wyj[ciowy dla tBumaczeD:',
      default: config?.output?.directory || './output',
    },
    {
      type: 'confirm',
      name: 'autoContinue',
      message: 'Automatycznie kontynuowa tBumaczenie?',
      default: config?.general?.autoContinue !== false,
    },
    {
      type: 'number',
      name: 'chapterDelay',
      message: 'Op�znienie midzy rozdziaBami (sekundy):',
      default: config?.general?.chapterDelay || 3,
    },
    {
      type: 'number',
      name: 'maxChapters',
      message: 'Maksymalna liczba rozdziaB�w do przetBumaczenia:',
      default: config?.general?.maxChapters || 1000,
    },
  ];

  const remainingAnswers = await inquirer.prompt(remainingQuestions);
  Object.assign(answers, remainingAnswers);

  const newConfig = {
    translator: {
      provider: answers.translatorProvider,
      apiKey: answers.translatorProvider === 'google' ? answers.googleTranslatorApiKey : answers.translatorApiKey,
    },
    tts:
      answers.ttsProvider !== 'none'
        ? {
            provider: answers.ttsProvider,
            voice: answers.ttsVoice,
            speed: parseFloat(answers.ttsSpeed),
            ...(answers.ttsApiKey && { apiKey: answers.ttsApiKey }),
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
  console.log('\n Konfiguracja zapisana pomy[lnie!');
  console.log('\nUruchom aplikacj z odpowiednimi parametrami:');
  console.log('npm start -- --url "URL_DO_NOVELI"');
}

runTUI().catch(console.error);