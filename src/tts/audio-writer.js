import fs from 'fs/promises';
import path from 'path';

export class AudioWriter {
  constructor(outputDir = './audio') {
    this.outputDir = outputDir;
  }

  async ensureDirectoryExists() {
    try {
      await fs.access(this.outputDir);
    } catch {
      await fs.mkdir(this.outputDir, { recursive: true });
    }
  }

  generateFilename(
    seriesId,
    chapterNumber,
    title,
    extension = 'mp3',
    speed = null,
  ) {
    const sanitizedTitle = title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    const chapterStr = String(chapterNumber).padStart(3, '0');

    // Dodaj prędkość do nazwy pliku jeśli jest inna niż domyślna
    if (speed && speed !== 1.0) {
      return `${seriesId}_${chapterStr}_${sanitizedTitle}_speed_${speed}.${extension}`;
    }

    return `${seriesId}_${chapterStr}_${sanitizedTitle}.${extension}`;
  }

  async writeAudioFile(audioBuffer, filename) {
    await this.ensureDirectoryExists();

    const fullPath = path.join(this.outputDir, filename);
    await fs.writeFile(fullPath, audioBuffer);

    // Pobierz rozmiar pliku po zapisie
    const stats = await fs.stat(fullPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Clear audioBuffer reference after file write to help GC
    audioBuffer = null;

    return {
      path: fullPath,
      size: stats.size,
      sizeMB: fileSizeMB,
    };
  }

  async writeAudioChapter(
    audioBuffer,
    seriesId,
    chapterNumber,
    title,
    speed = null,
  ) {
    const filename = this.generateFilename(
      seriesId,
      chapterNumber,
      title,
      'mp3',
      speed,
    );
    const result = await this.writeAudioFile(audioBuffer, filename);
    return result; // Zwróć pełny obiekt z informacjami o pliku
  }
}
