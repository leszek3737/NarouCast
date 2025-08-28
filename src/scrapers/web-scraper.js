import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export class WebScraper {
  constructor(config = {}) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ...config
    };
  }
  
  async scrapeChapter(url) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`Pobieranie ${url} (próba ${attempt}/${this.config.maxRetries})`);
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cookie': 'over18=yes',  // dla stron 18+
            'Referer': 'https://ncode.syosetu.com/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Debug: zapisz HTML do pliku
        if (process.env.DEBUG_HTML) {
          const fs = await import('fs/promises');
          await fs.writeFile('/tmp/debug.html', html);
          console.log('Zapisano HTML do /tmp/debug.html');
        }
        
        return this.parseChapterContent(html, url);
        
      } catch (error) {
        lastError = error;
        console.error(`Błąd podczas pobierania (próba ${attempt}): ${error.message}`);
        
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }
    
    throw new Error(`Nie udało się pobrać rozdziału po ${this.config.maxRetries} próbach: ${lastError.message}`);
  }
  
  parseChapterContent(html, url) {
    const $ = cheerio.load(html);
    
    // Tytuł rozdziału - różne możliwe selektory
    const title = $('.p-novel__title').text().trim() ||
                  $('title').text().replace(/\s*-\s*小説家になろう$/, '').trim() ||
                  'Bez tytułu';
    
    // Treść rozdziału - nowe selektory dla Syosetu (tylko główna treść, bez przedmów/posłowi)
    let contentElement = $('.js-novel-text.p-novel__text').not('.p-novel__text--preface, .p-novel__text--afterword');
    
    if (contentElement.length === 0) {
      // Fallback do podstawowego selektora
      contentElement = $('.js-novel-text.p-novel__text');
    }
    
    if (contentElement.length === 0) {
      // Fallback do starych selektorów
      contentElement = $('#novel_honbun .novel_view') ||
                       $('.novel_view') ||
                       $('#novel_honbun') ||
                       $('.novel_content');
    }
    
    if (contentElement.length === 0) {
      // Ostateczny fallback
      contentElement = $('.l-container');
    }

    if (contentElement.length === 0) {
      throw new Error('Nie znaleziono treści rozdziału na stronie');
    }
    
    // Usuwanie niepotrzebnych elementów
    contentElement.find('.p-novel__title').remove();
    contentElement.find('.novel_subtitle').remove();
    contentElement.find('script').remove();
    contentElement.find('style').remove();
    
    // Konwersja HTML na tekst z zachowaniem formatowania
    const content = this.htmlToText(contentElement);
    
    // Sprawdzenie czy istnieje link do następnego rozdziału
    const nextChapterLink = this.findNextChapterLink($, url);
    
    return {
      title: title,
      content: content.trim(),
      nextChapterUrl: nextChapterLink,
      url: url
    };
  }
  
  htmlToText(element) {
    const $ = cheerio.load(element.html());
    
    // Zamiana <br> na nowe linie
    $('br').replaceWith('\n');
    
    // Zamiana <p> na akapity z dodatkowymi liniami
    $('p').each((i, el) => {
      const $el = $(el);
      const text = $el.text();
      if (text.trim()) {
        $el.replaceWith(text + '\n\n');
      }
    });
    
    // Usuwanie HTML tagów i dekodowanie encji
    let text = $.text();
    
    // Normalizacja białych znaków
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ');
    
    return text;
  }
  
  findNextChapterLink($, currentUrl) {
    // Szukanie linku "次へ" (następny)
    const nextLink = $('a').filter((i, el) => {
      const text = $(el).text().trim();
      return text.includes('次へ') || text.includes('次の話') || text.includes('>>');
    }).first();
    
    if (nextLink.length > 0) {
      const href = nextLink.attr('href');
      if (href) {
        // Konwersja relatywnego URL na absolutny
        return new URL(href, currentUrl).href;
      }
    }
    
    return null;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}