import { SyosetuParser } from "../parsers/syosetu-parser.js";
import readline from "readline";

export class ChapterNavigator {
  constructor(config = {}) {
    this.config = {
      baseDelay: 1000, // Bazowe opóźnienie: 1s
      adaptiveDelay: true, // Adaptacyjne opóźnienia
      maxDelay: 10000, // Maksymalne opóźnienie: 10s
      minDelay: 500, // Minimalne opóźnienie: 0.5s
      chapterDelay: config.chapterDelay || 3000, // Backward compatibility
      autoContinue: true,
      maxChapters: 1000,
      ...config,
    };
    this.processedChapters = new Set();
    this.consecutiveErrors = 0;
    this.avgProcessingTime = 5000; // Średni czas przetwarzania
  }

  async processChapterSequence(startUrl, processor) {
    let currentUrl = startUrl;
    let chapterCount = 0;
    const results = [];

    console.log(`Rozpoczynam przetwarzanie od: ${startUrl}`);
    console.log(`Auto-continue: ${this.config.autoContinue}`);
    console.log(
      `Opóźnienie między rozdziałami: ${this.config.chapterDelay}ms\n`,
    );

    while (currentUrl && chapterCount < this.config.maxChapters) {
      const startTime = Date.now();

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

        console.log(
          `✓ Ukończono rozdział ${chapterCount}: ${result.title || "Bez tytułu"}`,
        );

        const nextUrl = result.nextChapterUrl;

        if (!nextUrl) {
          console.log("\\n🎉 Brak kolejnego rozdziału - seria zakończona!");
          break;
        }

        if (!this.config.autoContinue) {
          const shouldContinue = await this.promptContinue(nextUrl);
          if (!shouldContinue) {
            console.log("Zatrzymano na żądanie użytkownika.");
            break;
          }
        }

        if (nextUrl) {
          console.log(`Następny rozdział: ${nextUrl}`);

          // Calculate processing time for adaptive delay
          const processingTime = Date.now() - startTime;
          this.avgProcessingTime =
            (this.avgProcessingTime + processingTime) / 2;

          // Use adaptive delay or fallback to configured delay
          const delay = this.calculateAdaptiveDelay();
          console.log(`⏱️ Inteligentne opóźnienie: ${delay}ms`);
          await this.delay(delay);
          currentUrl = nextUrl;

          // Reset consecutive errors on success
          this.consecutiveErrors = 0;
        }
      } catch (error) {
        this.consecutiveErrors++;
        console.error(
          `❌ Błąd przetwarzania rozdziału ${chapterCount + 1}: ${error.message}`,
        );

        if (
          error.message.includes("404") ||
          error.message.includes("Not Found")
        ) {
          console.log("Rozdział nie istnieje - prawdopodobnie koniec serii.");
          break;
        }

        // Exponential backoff for errors
        const errorDelay = this.calculateErrorDelay();
        console.log(`⏳ Błąd, czekam: ${errorDelay}ms`);
        await this.delay(errorDelay);

        // Skip to next chapter on recoverable errors
        if (this.consecutiveErrors < 3) {
          try {
            currentUrl = await this.processNextChapter(currentUrl);
            continue;
          } catch (nextError) {
            console.error("Nie można przejść do następnego rozdziału");
          }
        }

        throw error;
      }
    }

    if (chapterCount >= this.config.maxChapters) {
      console.log(
        `\\n⚠️  Osiągnięto maksymalną liczbę rozdziałów (${this.config.maxChapters})`,
      );
    }

    console.log("\\n📊 Podsumowanie:");
    console.log(`- Przetworzonych rozdziałów: ${chapterCount}`);
    console.log(`- Rozpoczęto od: ${startUrl}`);
    console.log(
      `- Zakończono na: ${currentUrl || "ostatnim dostępnym rozdziale"}`,
    );

    return {
      results,
      totalChapters: chapterCount,
      startUrl,
      lastUrl: currentUrl,
    };
  }

  async processNextChapter(currentUrl) {
    try {
      const parsedUrl = SyosetuParser.parseUrl(currentUrl);
      const nextChapterNumber = parsedUrl.chapterNumber + 1;
      const nextUrl = SyosetuParser.buildChapterUrl(
        parsedUrl.seriesId,
        nextChapterNumber,
      );

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
        output: process.stdout,
      });

      rl.question(
        `Kontynuować z następnym rozdziałem (${nextUrl})? (t/n): `,
        (answer) => {
          rl.close();
          resolve(answer.toLowerCase().startsWith("t"));
        },
      );
    });
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  calculateAdaptiveDelay() {
    // Use legacy delay if adaptive is disabled
    if (!this.config.adaptiveDelay) {
      return this.config.chapterDelay;
    }

    // Krótsze opóźnienie dla szybkiego przetwarzania
    const adaptiveDelay = Math.max(
      this.config.minDelay,
      Math.min(
        this.config.maxDelay,
        this.avgProcessingTime * 0.2, // 20% średniego czasu
      ),
    );

    return adaptiveDelay;
  }

  calculateErrorDelay() {
    // Exponential backoff for errors
    return Math.min(
      this.config.maxDelay,
      this.config.baseDelay * Math.pow(2, this.consecutiveErrors),
    );
  }
}
