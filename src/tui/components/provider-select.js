import React from 'react';
import { Select } from 'ink-ui';

export function ProviderSelect({
  value,
  onChange,
  label,
  providers,
  disabled = false,
}) {
  const options = providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
    description: provider.description,
  }));

  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
    />
  );
}
