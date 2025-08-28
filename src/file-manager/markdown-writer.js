import fs from 'fs/promises';
import path from 'path';

export class MarkdownWriter {
  constructor(outputDir = './output') {
    this.outputDir = outputDir;
  }
  
  async writeChapter(chapterData, filename) {
    try {
      await this.ensureOutputDirectory();
      
      const filePath = path.join(this.outputDir, filename);
      const markdownContent = this.formatChapterAsMarkdown(chapterData);
      
      await fs.writeFile(filePath, markdownContent, 'utf8');
      console.log(`Zapisano: ${filePath}`);
      
      return filePath;
    } catch (error) {
      throw new Error(`Błąd zapisu pliku: ${error.message}`);
    }
  }
  
  formatChapterAsMarkdown(chapterData) {
    const { title, content, originalUrl, chapterNumber, seriesId } = chapterData;
    
    const header = this.createMarkdownHeader(title, originalUrl, chapterNumber, seriesId);
    const formattedContent = this.formatContent(content);
    
    return `${header}\n\n${formattedContent}\n`;
  }
  
  createMarkdownHeader(title, originalUrl, chapterNumber, seriesId) {
    return `# ${title}

---`;
  }
  
  formatContent(content) {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');
  }
  
  async ensureOutputDirectory() {
    try {
      await fs.access(this.outputDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(this.outputDir, { recursive: true });
        console.log(`Utworzono katalog: ${this.outputDir}`);
      } else {
        throw error;
      }
    }
  }
  
  async checkFileExists(filename) {
    try {
      const filePath = path.join(this.outputDir, filename);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async getOutputPath(filename) {
    return path.join(this.outputDir, filename);
  }
  
  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
  }
}