import React, { useState } from "react";
import { Box, Text } from "ink";
import { Form, SubmitButton } from "ink-ui";
import { ProviderSelect } from "./provider-select.js";
import { ApiKeyInput } from "./api-key-input.js";
import { VoiceSelect } from "./voice-select.js";
import {
  TRANSLATOR_PROVIDERS,
  TTS_PROVIDERS,
  AVAILABLE_VOICES,
} from "../utils/voices.js";

export function ConfigForm({ config, onSubmit, onCancel: _onCancel }) {
  const [formData, setFormData] = useState({
    translatorProvider: config?.translator?.provider || "openai",
    translatorApiKey: config?.translator?.apiKey || "",
    ttsProvider: config?.tts?.provider || "none",
    ttsVoice: config?.tts?.voice || "",
    ttsSpeed: config?.tts?.speed || 1.0,
    outputDir: config?.output?.directory || "./output",
    audioDir: config?.output?.audioDirectory || "./audio",
    autoContinue: config?.general?.autoContinue !== false,
    chapterDelay: config?.general?.chapterDelay || 3,
    maxChapters: config?.general?.maxChapters || 1000,
  });

  const handleSubmit = () => {
    const newConfig = {
      translator: {
        provider: formData.translatorProvider,
        apiKey: formData.translatorApiKey,
      },
      tts: {
        provider: formData.ttsProvider,
        voice: formData.ttsVoice,
        speed: parseFloat(formData.ttsSpeed),
      },
      output: {
        directory: formData.outputDir,
        audioDirectory: formData.audioDir,
      },
      general: {
        autoContinue: formData.autoContinue,
        chapterDelay: parseInt(formData.chapterDelay),
        maxChapters: parseInt(formData.maxChapters),
      },
    };

    onSubmit(newConfig);
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Box flexDirection="column" gap={1}>
        <Text bold color="cyan">
          Konfiguracja Tłumaczenia
        </Text>

        <ProviderSelect
          label="Provider Tłumaczenia"
          value={formData.translatorProvider}
          onChange={(value) => updateField("translatorProvider", value)}
          providers={TRANSLATOR_PROVIDERS}
        />

        <ApiKeyInput
          label="Klucz API"
          value={formData.translatorApiKey}
          onChange={(value) => updateField("translatorApiKey", value)}
          placeholder="Wprowadź klucz API dla wybranego providera"
        />

        <Text bold color="cyan" marginTop={1}>
          Konfiguracja Text-to-Speech
        </Text>

        <ProviderSelect
          label="Provider TTS"
          value={formData.ttsProvider}
          onChange={(value) => updateField("ttsProvider", value)}
          providers={TTS_PROVIDERS}
        />

        <VoiceSelect
          label="Wybierz Głos"
          value={formData.ttsVoice}
          onChange={(value) => updateField("ttsVoice", value)}
          provider={formData.ttsProvider}
          voices={AVAILABLE_VOICES}
        />

        <Text bold color="cyan" marginTop={1}>
          Ustawienia Ogólne
        </Text>

        <SubmitButton label="Zapisz Konfigurację" />
      </Box>
    </Form>
  );
}
