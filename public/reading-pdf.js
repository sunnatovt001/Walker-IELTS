const passageHeading = /^(?:READING\s+)?PASSAGE\s+([123])\s*[:.\-–—]?\s*$/i;
const questionsHeading = /^Questions?\s+(\d{1,2})(?:\s*(?:[-–—]|and|&)\s*(\d{1,2}))?\s*[.:]?$/i;
const testHeading = /^(?:ACADEMIC READING |READING )?TEST\s+(\d{1,2})\s*$/i;
const answerHeading = /^(?:(?:READING\s+|LISTENING\s+(?:AND|&)\s+READING\s+|VERIFIED\s+)?(?:ANSWER\s+KEYS?|ANSWERS|ANSWER\s+SHEET)|KEY\s+TO\s+(?:THE\s+)?(?:READING\s+)?TESTS?)(?:\s*[·:–—-]?\s*TEST\s+(\d{1,2}))?\s*[:.]?$/i;
const numberedKey = /^(0?[1-9]|[1-3]\d|40)(?:[.):\s]+\s*(\S.*))?$/;
const skillHeading = /^(READING|LISTENING|WRITING|SPEAKING)(?:\s+(?:ANSWER\s+KEYS?|ANSWERS))?\s*[:.]?$/i;
const keyTestHeading = /^TEST\s+(\d{1,2})\s*[-–—·:]?\s+(READING|LISTENING)(?:\s+(?:ANSWER\s+KEYS?|ANSWERS))?\s*[:.]?$/i;
const bookFingerprint = '8238491ded005491f31f322b41acaa927f5cc604c2bd37e2ab8b609ba3d10683';

// Page anchors for this edition. Several printed passage and question labels are missing or inconsistent.
const bookLayout = [
  [[4,6,1,13],[8,11,14,26],[13,15,27,40],16],
  [[18,19,1,13],[21,23,14,26],[25,28,27,40],30],
  [[32,34,1,13],[36,38,14,26],[40,42,27,40],46],
  [[48,49,1,13],[51,53,14,26],[55,58,27,40],60],
  [[62,64,1,13],[65,67,14,26],[69,72,27,40],74],
  [[76,78,1,13],[80,82,14,26],[84,87,27,40],89],
  [[91,92,1,13],[94,96,14,26],[98,101,27,40],103],
  [[105,107,1,13],[109,112,14,26],[114,116,27,40],119],
  [[121,123,1,13],[125,127,14,27],[129,131,28,40],133],
  [[135,137,1,13],[139,141,14,26],[144,146,27,40],149],
  [[151,153,1,13],[155,157,14,23],[159,161,27,40],163],
  [[165,167,1,13],[169,172,14,26],[174,176,27,40],177]
];

function pageLines(items, pageHeight, bookBody = false) {
  const lines = [];
  let line;
  for (const item of items) {
    const value = item.str?.trim();
    if (!value) {
      if (item.hasEOL) line = undefined;
      continue;
    }
    const [, , , , x, y] = item.transform;
    if (bookBody ? !(item.height > 12 && item.height < 16) : y < 15 || y > pageHeight - 15) continue;
    if (line && Math.abs(y - line.y) < 2 && x >= line.x && x - line.right < Math.max(20, item.height * 1.7)) {
      line.text += ' ' + value;
      line.right = x + item.width;
    } else {
      line = { text: value, x, y, right: x + item.width };
      lines.push(line);
    }
    if (item.hasEOL) line = undefined;
  }
  return lines;
}

function normalizeKey(value) {
  const optional = /^\(([^)]+)\)\s+(.+)$/.exec(value);
  return optional ? optional[2] + ' | ' + optional[1] + ' ' + optional[2] : value.replace(/\s+\/\s+/g, ' | ');
}

function choicesFor(text) {
  if (/^TRUE\b/im.test(text) && /^FALSE\b/im.test(text)) return ['TRUE', 'FALSE', 'NOT GIVEN'];
  if (/^YES\b/im.test(text) && /^NO\s+if\b/im.test(text)) return ['YES', 'NO', 'NOT GIVEN'];
  if (/list of headings|correct heading/i.test(text)) {
    const headings = [...new Set([...text.matchAll(/^([ivx]{1,5})(?:[.\s]|$)/gm)].map(match => match[1]))];
    if (headings.length > 2 && headings.length <= 20) return headings;
  }
  const range = /\bA\s*[-–—]\s*([B-K])\b/.exec(text);
  if (range) return 'ABCDEFGHIJK'.slice(0, 'ABCDEFGHIJK'.indexOf(range[1]) + 1).split('');
  if (/\bA,\s*B,?\s*C(?:,?\s+or)?\s*,?\s*D\b/i.test(text)) return ['A', 'B', 'C', 'D'];
  if (/\bA,\s*B\s+or\s+C\b/i.test(text)) return ['A', 'B', 'C'];
  return [];
}

function makeSection(title, passage, questionLines, first, last) {
  if (!passage.length || !questionLines.length || first > last || last > 40) return null;
  const groups = [];
  let start = first;
  let lines = [];
  function addGroup(end) {
    const text = lines.join('\n').trim();
    if (!text) return;
    groups.push({
      text, numbers: Array.from({ length: end - start + 1 }, (_, i) => start + i),
      choices: choicesFor(text),
      unordered: end > start && /choose\s+(?:TWO|THREE|FOUR)\s+letters/i.test(text)
    });
  }
  for (const line of questionLines) {
    const next = Number(questionsHeading.exec(line)?.[1]);
    if (next > start && next <= last) {
      addGroup(next - 1);
      start = next;
      lines = [];
    }
    if (lines.at(-1) !== line) lines.push(line);
  }
  addGroup(last);
  const paragraphs = [];
  let paragraph = '';
  for (const line of passage) {
    if (paragraph && /^[A-L][.\s] +[A-Z“]/.test(line)) {
      paragraphs.push(paragraph);
      paragraph = '';
    }
    paragraph += (paragraph ? ' ' : '') + line;
    if (line.length < 65 && /[.!?…”]$/.test(line)) {
      paragraphs.push(paragraph);
      paragraph = '';
    }
  }
  if (paragraph) paragraphs.push(paragraph);
  return { title: title.slice(0, 180), passage: paragraphs.join('\n\n'), groups };
}

function makeTest(title, sections, answerKey, review = []) {
  const keys = [];
  const missing = [];
  for (const group of sections.flatMap(section => section.groups)) {
    for (const number of group.numbers) {
      let key = answerKey.get(number) || '';
      if (group.choices[0] === 'TRUE') key = { YES: 'TRUE', NO: 'FALSE' }[key.toUpperCase()] || key;
      if (group.choices[0] === 'YES') key = { TRUE: 'YES', FALSE: 'NO' }[key.toUpperCase()] || key;
      if (key && group.choices.length && !key.split('|').some(value =>
        group.choices.some(choice => choice.toLowerCase() === value.trim().toLowerCase()))) {
        review.push('Check the extracted choices for question ' + number + '. This group currently uses typed answers.');
        group.choices = [];
      }
      if (!key) missing.push(number);
      keys.push(key);
    }
  }
  review.unshift('Compare passages, question wording, choices, and answers against the PDF before publishing. Diagrams, highlights and handwritten annotations may require manual review.');
  if (missing.length) review.push('Enter missing answer keys for questions ' + missing.join(', ') + ' before publishing.');
  return { title, sections, keys, review };
}

const skipLine = /^(?:You should spend about 20 minutes|Passage [123] (?:below|on pages)|(?:Overall:\s*)?\d+\s*mistakes|Prove+d+\.?$)/i;

function correctBookQuestions(lines, test, passage, key) {
  let text = lines.join('\n');
  if (test === 2 && passage === 3) {
    text = text.replace(/^Questions 10-14$/m, 'Questions 36-40')
      .replace(/boxes 1-5/g, 'boxes 27–31').replace(/boxes 6-9/g, 'boxes 32–35')
      .replace(/boxes 10-14/g, 'boxes 36–40').replace(/A, B, c or D/gi, 'A, B, C or D');
  }
  if (test === 3 && passage === 1) {
    text = text.replace(/^Complete the notes below\./mi, 'Questions 6–13\n$&');
  }
  if (test === 4 && passage === 1) {
    text = text.replace(/\b(8|9|11|12|13)\s+_{3,}\s+[^_]{1,45}\s+_{3,}/g, '$1 __________')
      .replace(/\b10\s+the\s+razorback\s+sucker\s+\.{3}/i, '10 __________');
  }
  if (test === 4 && passage === 2) {
    const numbers = [18, 19, 20, 21, 22, 23, 24, 25, 26];
    for (const number of numbers) {
      const options = (key.get(number) || '').split('|').map(value => value.trim()).filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map(value => value.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
      if (!options.length) continue;
      const blank = new RegExp('\\b' + number + '\\s+(?:_{3,}\\s+)?(?:' + options.join('|') + ')(?=\\W|$)(?:\\s+_{3,}|\\s+\\.{3,})?', 'i');
      text = text.replace(blank, number + ' __________');
    }
  }
  if (test === 10 && passage === 3) {
    text = text.replace(/^Questions (37|39)[-–—](38|40)$/gm, '$&\nChoose TWO letters, A–E.')
      .replace(/^Questions 35[-–—]36$/m,
        'Corn → Milling → (31) __________ → Unrefined dextrose → (32) __________ → Lactic acid → (33) __________ → Lactide → Vacuum distillation → (34) __________ → Solvent-free melting → NatureWorks PLA\n$&');
  }
  if (test === 12 && passage === 3) {
    text = text.replace(/(Questions |boxes )37[-–—]39/gi, (_, prefix) => prefix + '37–40')
      .replace('given in Reading Passage 1?', 'given in Reading Passage 3?');
    if (!/^40[.\s]/m.test(text)) text += '\n40 Human control of breathing is essential for both laughter and speech.';
  }
  return text.split('\n');
}

function parseBook(pages) {
  return bookLayout.map((layout, index) => {
    const number = index + 1;
    const [,, , endPage] = layout;
    const rows = pages.map(page => page?.body);
    const position = ([page, questionPage, first], passage) => {
      const headings = rows[page].findIndex(row => Number(passageHeading.exec(row)?.[1]) === passage);
      const question = rows[questionPage].findIndex(row => Number(questionsHeading.exec(row)?.[1]) === first);
      return { begin: [page, Math.max(0, headings + 1)], question: [questionPage, question] };
    };
    const slice = ([first, from], [last, to]) => rows.slice(first, last + 1).flatMap((lines, i) =>
      lines.slice(i === 0 ? from : 0, first + i === last ? to : undefined))
      .filter(line => !skipLine.test(line) && !testHeading.test(line));
    const key = pages[179 + index].key;
    const anchors = layout.slice(0, 3).map((part, i) => position(part, i + 1));
    const sections = anchors.map(({ begin, question }, i) => {
      const [, , first, last] = layout[i];
      if (question[1] === -1) throw new Error('Could not read the question headings for Test ' + number + '.');
      const next = anchors[i + 1]?.begin;
      const end = next ? [next[0], Math.max(0, next[1] - 1)] : [endPage, rows[endPage].length];
      const passage = slice(begin, question);
      const questions = slice(question, end);
      if (number === 11 && i === 1) {
        const missing = questions.findIndex(line => /^Questions?\s+24\b/i.test(line));
        if (missing !== -1) questions.splice(missing);
      }
      const missingTitle = (number === 6 && i === 2) || (number === 7 && i === 0);
      const title = missingTitle ? 'Passage ' + (i + 1) : passage.shift()?.trim() || 'Passage ' + (i + 1);
      return makeSection(title, passage, correctBookQuestions(questions, number, i + 1, key), first, last);
    });
    if (sections.some(section => !section)) throw new Error('Could not read all three passages for Test ' + number + '.');
    const notes = ['Some source instructions use inconsistent numbering. Check that every question matches its answer field.'];
    if (number === 4 || number === 6) notes.push('The source contains prefilled answers or annotations. Remove any visible answers before publishing.');
    if (number === 10) notes.push('Check the printed flowchart in Passage 3 against questions 31–34.');
    if (number === 11) notes.push('Questions 24–26 are absent from the printed passage. They are excluded.');
    if (number === 12) notes.push('Check the printed correction for question 40 and add its statement if missing.');
    return makeTest('Authentic Reading 2 · Test ' + String(number).padStart(2, '0'), sections, key, notes);
  });
}

function parseGeneric(pages) {
  const candidates = [];
  let current;
  let answers = false;
  let keyNumber;
  let keySkill;
  let pendingTest;
  const keys = new Map();
  for (const page of pages.slice(1)) {
    for (const [index, row] of page.lines.entries()) {
      const line = row.text;
      const answer = answerHeading.exec(line);
      const heading = testHeading.exec(line);
      const passage = passageHeading.exec(line);
      const skill = skillHeading.exec(line);
      const keyTest = keyTestHeading.exec(line);
      if (keyTest && (answers || /answers?|keys?/i.test(line))) {
        answers = true;
        keyNumber = Number(keyTest[1]);
        keySkill = keyTest[2].toLowerCase();
        pendingTest = undefined;
      } else if (answer) {
        if (!answers || answer[1]) keyNumber = Number(answer[1]) || current?.number || 1;
        answers = true;
        keySkill = /^READING\b/i.test(line) ? 'reading' : '';
        pendingTest = undefined;
      } else if (heading) {
        const number = Number(heading[1]);
        if (answers) {
          keyNumber = pendingTest = number;
          keySkill = '';
        } else if (!current || current.number !== number) {
          current = { number, parts: [] };
          candidates.push(current);
        }
      } else if (passage) {
        const part = Number(passage[1]);
        const next = page.lines[index + 1]?.text;
        if (answers && /^(?:0?[1-9]|[1-3]\d|40)(?:[.):\s]|$)/.test(next || '')) {
          keySkill = 'reading';
          continue;
        }
        answers = false;
        if (!current || (part === 1 && current.parts.length)) {
          current = { number: pendingTest || (current?.number || 0) + 1, parts: [] };
          candidates.push(current);
        }
        pendingTest = undefined;
        current.parts.push([]);
      } else if (skill && (answers || /answers?|keys?/i.test(line))) {
        answers = true;
        keyNumber ||= current?.number || 1;
        keySkill = skill[1].toLowerCase();
      } else if (answers) {
        if (keySkill && keySkill !== 'reading') continue;
        const match = numberedKey.exec(line);
        if (!match) continue;
        const next = page.lines[index + 1];
        const value = match[2] || (next && next.x > row.x && Math.abs(next.y - row.y) < 4 &&
          !numberedKey.test(next.text) ? next.text : '');
        if (!value) continue;
        if (!keys.has(keyNumber)) keys.set(keyNumber, new Map());
        keys.get(keyNumber).set(Number(match[1]), normalizeKey(value.trim()));
      } else current?.parts.at(-1)?.push(line);
    }
  }
  const tests = [];
  for (const { number, parts } of candidates) {
    if (parts.length !== 3) continue;
    const headings = parts.map(part => part.findIndex(line => questionsHeading.test(line)));
    if (headings.some(index => index < 1)) continue;
    const firsts = parts.map((part, i) => Number(questionsHeading.exec(part[headings[i]])[1]));
    if (firsts[0] !== 1 || firsts[1] <= firsts[0] || firsts[2] <= firsts[1] || firsts[2] > 40) continue;
    const sections = parts.map((part, i) => {
      const passage = part.slice(0, headings[i]).filter(line => !skipLine.test(line));
      const questionLines = part.slice(headings[i]);
      const printedNumbers = questionLines.flatMap(line => {
        const range = questionsHeading.exec(line);
        if (range) return [Number(range[2] || range[1])];
        const item = /^(\d{1,2})[.)\s]/.exec(line);
        return item ? [Number(item[1])] : [];
      }).filter(value => value <= 40);
      const last = Math.max(...printedNumbers);
      if (i < 2 && last !== firsts[i + 1] - 1) return null;
      return makeSection(passage.shift() || 'Passage ' + (i + 1), passage, questionLines, firsts[i], last);
    });
    if (sections.some(section => !section)) continue;
    tests.push(makeTest('Reading Test ' + String(number).padStart(2, '0'), sections, keys.get(number) || new Map()));
  }
  return tests;
}

export async function extractReadingTests(file, onProgress, signal) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a PDF up to 30 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Choose a valid PDF file.');
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const knownBook = fingerprint === bookFingerprint;
  signal.throwIfAborted();
  const { getDocument } = await import('./vendor/pdfjs.mjs');
  signal.throwIfAborted();
  const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  try {
    const document = await task.promise;
    if (document.numPages > 250) throw new Error('Choose a PDF with up to 250 pages. Split larger books into smaller volumes.');
    const pages = [null];
    for (let n = 1; n <= document.numPages; n++) {
      signal.throwIfAborted();
      const page = await document.getPage(n);
      const { items } = await page.getTextContent();
      if (knownBook) {
        const key = new Map();
        if (n >= 179 && n <= 190) {
          const entries = items.filter(item => item.str?.trim());
          for (let i = 0; i < entries.length - 1; i++) {
            const item = entries[i];
            const next = entries[i + 1];
            if (/^\d{2}$/.test(item.str) && Math.abs(item.transform[5] - next.transform[5]) < 4) {
              key.set(Number(item.str), normalizeKey(next.str.trim()));
            }
          }
        }
        pages.push({ body: pageLines(items, page.view[3], true).map(row => row.text), key });
      } else {
        pages.push({ lines: pageLines(items, page.view[3]) });
      }
      page.cleanup();
      if (n === document.numPages || n % 8 === 0) {
        onProgress(n, document.numPages);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (!knownBook && !pages.slice(1).some(page => page.lines.length)) {
      throw new Error('This PDF contains no selectable text. Upload a text-based PDF or run OCR on the scan first.');
    }
    const tests = knownBook ? parseBook(pages) : parseGeneric(pages);
    if (!tests.length) throw new Error('No complete Reading tests found. Use a PDF with selectable text and clear Passage 1–3 and Questions headings.');
    return tests;
  } finally {
    await task.destroy();
  }
}
