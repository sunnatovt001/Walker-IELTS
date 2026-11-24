export const readingFormat = 'walker-reading-cd-v1';

export function readCdPrompt(prompt) {
  if (!prompt.startsWith('{"format":"' + readingFormat + '"')) return null;
  try {
    const { sections } = JSON.parse(prompt);
    return Array.isArray(sections) && sections.every(section => Array.isArray(section?.groups)) ? sections : null;
  } catch {
    return null;
  }
}

export const questionGroups = sections => sections.flatMap(section => section.groups);

export function validatedReading(sections, keys) {
  const invalid = () => { throw Object.assign(new Error('Check the CD passages, question numbers, choices, and answer key.'), { status: 400 }); };
  const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;
  if (!Array.isArray(sections) || sections.length !== 3) invalid();
  let previous = 0;
  const clean = sections.map(section => {
    if (!section || !text(section.title, 180) || !text(section.passage, 40000) ||
        !Array.isArray(section.groups) || !section.groups.length || section.groups.length > 15) invalid();
    const groups = section.groups.map(group => {
      if (!group || !text(group.text, 18000) || !Array.isArray(group.numbers) || !group.numbers.length ||
          !Array.isArray(group.choices) || group.choices.length > 20 || group.choices.some(value => !text(value, 60)) ||
          typeof group.unordered !== 'boolean') invalid();
      for (const number of group.numbers) {
        if (!Number.isInteger(number) || number <= previous || number > 40) invalid();
        previous = number;
      }
      return { text: group.text, numbers: group.numbers, choices: group.choices, unordered: group.unordered === true };
    });
    return { title: section.title, passage: section.passage, groups };
  });
  if (questionGroups(clean).flatMap(group => group.numbers).length !== keys.length) invalid();
  return JSON.stringify({ format: readingFormat, sections: clean });
}

export function gradeAnswers(answers, keys, sections, normalize) {
  const expected = keys.map(key => key.split('|').map(normalize).filter(Boolean));
  const correct = expected.map((options, index) => options.includes(normalize(answers[index])));
  let position = 0;
  for (const group of sections ? questionGroups(sections) : []) {
    const start = position;
    position += group.numbers.length;
    if (!group.unordered) continue;
    const available = expected.slice(start, position);
    const ranks = new Map();
    function match(answer, seen) {
      for (const [index, options] of available.entries()) {
        if (seen.has(index) || !options.includes(normalize(answers[answer]))) continue;
        seen.add(index);
        if (!ranks.has(index) || match(ranks.get(index), seen)) {
          ranks.set(index, answer);
          return true;
        }
      }
      return false;
    }
    for (let index = start; index < position; index++) correct[index] = match(index, new Set());
  }
  return correct;
}
