import React from "react";
import { Select } from "ink-ui";

export function VoiceSelect({ value, onChange, label, provider, voices = [] }) {
  const voiceOptions = voices
    .filter((voice) => voice.provider === provider)
    .map((voice) => ({
      label: `${voice.name} (${voice.language})`,
      value: voice.id,
      description: voice.gender ? `Płeć: ${voice.gender}` : "",
    }));

  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={voiceOptions}
      disabled={!provider || provider === "none" || voiceOptions.length === 0}
      placeholder={
        !provider ? "Wybierz najpierw providera TTS" : "Wybierz głos"
      }
    />
  );
}
