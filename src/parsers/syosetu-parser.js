export class SyosetuParser {
  static parseUrl(url) {
    const urlPattern = /https?:\/\/ncode\.syosetu\.com\/([a-z0-9]+)\/(\d+)\/?/;
    const match = url.match(urlPattern);

    if (!match) {
      throw new Error(`Nieprawidłowy URL Syosetu: ${url}`);
    }

    const [, seriesId, chapterNumber] = match;

    return {
      seriesId,
      chapterNumber: parseInt(chapterNumber, 10),
      baseUrl: `https://ncode.syosetu.com/${seriesId}`,
      fullUrl: url,
    };
  }

  static buildChapterUrl(seriesId, chapterNumber) {
    return `https://ncode.syosetu.com/${seriesId}/${chapterNumber}/`;
  }

  static getNextChapterUrl(seriesId, currentChapter) {
    return this.buildChapterUrl(seriesId, currentChapter + 1);
  }

  static sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
  }

  static buildFilename(seriesId, chapterNumber, title) {
    const sanitizedTitle = this.sanitizeFilename(title);
    return `${seriesId}_${chapterNumber.toString().padStart(3, '0')}_${sanitizedTitle}.md`;
  }
}
