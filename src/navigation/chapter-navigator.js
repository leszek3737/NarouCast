import { SyosetuParser } from '../parsers/syosetu-parser.js';
import readline from 'readline';

export class ChapterNavigator {
  constructor(config = {}) {
    this.config = {
      chapterDelay: 3000,
      autoContinue: true,
      maxChapters: 1000,
      ...config
    };
    this.processedChapters = new Set();
  }
  
  async processChapterSequence(startUrl, processor) {
    let currentUrl = startUrl;
    let chapterCount = 0;
    const results = [];
    
    console.log(`Rozpoczynam przetwarzanie od: ${startUrl}`);
    console.log(`Auto-continue: ${this.config.autoContinue}`);
    console.log(`Opóźnienie między rozdziałami: ${this.config.chapterDelay}ms\n`);
    
    while (currentUrl && chapterCount < this.config.maxChapters) {
      try {
        if (this.processedChapters.has(currentUrl)) {
          console.log(`Rozdział już przetworzony: ${currentUrl}`);
          break;
        }
        
        console.log(`\n=== Przetwarzanie rozdziału ${chapterCount + 1} ===`);
        console.log(`URL: ${currentUrl}`);
        
        const result = await processor(currentUrl);
        results.push(result);
        this.processedChapters.add(currentUrl);
        chapterCount++;
        
        console.log(`✓ Ukończono rozdział ${chapterCount}: ${result.title || 'Bez tytułu'}`);
        
        const nextUrl = result.nextChapterUrl;
        
        if (!nextUrl) {
          console.log('\\n🎉 Brak kolejnego rozdziału - seria zakończona!');
          break;
        }
        
        if (!this.config.autoContinue) {
          const shouldContinue = await this.promptContinue(nextUrl);
          if (!shouldContinue) {
            console.log('Zatrzymano na żądanie użytkownika.');
            break;
          }
        }
        
        if (nextUrl) {
          console.log(`Następny rozdział: ${nextUrl}`);
          console.log(`Czekam ${this.config.chapterDelay / 1000}s przed kolejnym rozdziałem...`);
          await this.delay(this.config.chapterDelay);
          currentUrl = nextUrl;
        }
        
      } catch (error) {
        console.error(`❌ Błąd przetwarzania rozdziału ${chapterCount + 1}: ${error.message}`);
        
        if (error.message.includes('404') || error.message.includes('Not Found')) {
          console.log('Rozdział nie istnieje - prawdopodobnie koniec serii.');
          break;
        }
        
        throw error;
      }
    }
    
    if (chapterCount >= this.config.maxChapters) {
      console.log(`\\n⚠️  Osiągnięto maksymalną liczbę rozdziałów (${this.config.maxChapters})`);
    }
    
    console.log(`\\n📊 Podsumowanie:`);
    console.log(`- Przetworzonych rozdziałów: ${chapterCount}`);
    console.log(`- Rozpoczęto od: ${startUrl}`);
    console.log(`- Zakończono na: ${currentUrl || 'ostatnim dostępnym rozdziale'}`);
    
    return {
      results,
      totalChapters: chapterCount,
      startUrl,
      lastUrl: currentUrl
    };
  }
  
  async processNextChapter(currentUrl) {
    try {
      const parsedUrl = SyosetuParser.parseUrl(currentUrl);
      const nextChapterNumber = parsedUrl.chapterNumber + 1;
      const nextUrl = SyosetuParser.buildChapterUrl(parsedUrl.seriesId, nextChapterNumber);
      
      return nextUrl;
    } catch (error) {
      console.warn(`Nie można wygenerować następnego URL: ${error.message}`);
      return null;
    }
  }
  
  async promptContinue(nextUrl) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question(`Kontynuować z następnym rozdziałem (${nextUrl})? (t/n): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('t'));
      });
    });
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  setAutoContinue(autoContinue) {
    this.config.autoContinue = autoContinue;
  }
  
  setChapterDelay(delay) {
    this.config.chapterDelay = delay;
  }
  
  getProcessedChapters() {
    return Array.from(this.processedChapters);
  }
  
  resetProcessedChapters() {
    this.processedChapters.clear();
  }
}