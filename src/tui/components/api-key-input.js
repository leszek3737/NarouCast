import React, { useState } from "react";
import { TextInput } from "ink-ui";

export function ApiKeyInput({
  value,
  onChange,
  label,
  placeholder = "Wprowadź klucz API...",
  masked = true,
}) {
  const [internalValue, setInternalValue] = useState(value || "");

  const handleChange = (newValue) => {
    setInternalValue(newValue);
    onChange(newValue);
  };

  return (
    <TextInput
      label={label}
      value={masked && internalValue ? "•".repeat(16) : internalValue}
      onChange={handleChange}
      placeholder={placeholder}
      mask={masked}
    />
  );
}
