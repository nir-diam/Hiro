/** User-agents that fetch Open Graph metadata for link previews (WhatsApp, Facebook, etc.). */
const SOCIAL_CRAWLER_RE =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|Embedly|preview/i;

const isSocialCrawler = (userAgent) => SOCIAL_CRAWLER_RE.test(String(userAgent || ''));

module.exports = { isSocialCrawler, SOCIAL_CRAWLER_RE };
