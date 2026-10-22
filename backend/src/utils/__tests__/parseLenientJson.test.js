const { parseLenientJsonObject } = require('../parseLenientJson');

describe('parseLenientJsonObject', () => {
  it('parses valid JSON unchanged', () => {
    expect(parseLenientJsonObject('{"a":"ש\\"ח","n":1}')).toEqual({ a: 'ש"ח', n: 1 });
  });

  it('strips a markdown fence', () => {
    expect(parseLenientJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('repairs an unescaped quote inside a Hebrew string', () => {
    const raw = `{
      "question": "האם רמת האנגלית שלך מאפשרת זיהוי אותיות וקריאת מק"טים בסיסית?",
      "expectedAnswer": "כן"
    }`;
    expect(parseLenientJsonObject(raw)).toEqual({
      question: 'האם רמת האנגלית שלך מאפשרת זיהוי אותיות וקריאת מק"טים בסיסית?',
      expectedAnswer: 'כן',
    });
  });

  it('drops a trailing comma', () => {
    expect(parseLenientJsonObject('{"a":1,}')).toEqual({ a: 1 });
  });
});
