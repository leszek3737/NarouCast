const React = require('react');
const { useState } = React;
const { Box, Text } = require('ink');
const { useConfig } = require('./hooks/use-config.js');
const { ConfigForm } = require('./components/config-form.js');

function App() {
  const { config, loading, error, saveConfig } = useConfig();
  const [saved, setSaved] = useState(false);

  const handleConfigSubmit = async (newConfig) => {
    try {
      await saveConfig(newConfig);
      setSaved(true);
      
      // Reset saved status after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Błąd zapisywania konfiguracji:', err);
    }
  };

  if (loading) {
    return <Text>Ładowanie konfiguracji...</Text>;
  }

  if (error) {
    return <Text color="red">Błąd: {error}</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green" marginBottom={1}>
        🚀 Syosetu Translator - Konfiguracja
      </Text>
      
      {saved && (
        <Text color="green" marginBottom={1}>
          ✅ Konfiguracja zapisana pomyślnie!
        </Text>
      )}

      <ConfigForm 
        config={config} 
        onSubmit={handleConfigSubmit}
      />

      <Text marginTop={1} color="gray">
        Użyj klawiszy strzałek do nawigacji, Enter do wyboru, Ctrl+C aby wyjść
      </Text>
    </Box>
  );
}

module.exports = App;