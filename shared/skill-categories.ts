export const skillCategories = [
  ['documents', 'Documents / 文档', /pdf|docx|xlsx|pptx|document|spreadsheet|presentation/i],
  ['development', 'Development / 开发', /code|coding|frontend|web|test|cli|debug|developer/i],
  ['media', 'Media / 媒体', /image|video|audio|music|speech|design|canvas|gif/i],
  [
    'integrations',
    'Integrations / 集成',
    /mcp|notion|figma|linear|sentry|slack|api|deploy|github/i,
  ],
  ['writing', 'Writing / 写作', /writing|comms|coauthor|research|communication|guide/i],
  ['security', 'Security / 安全', /security|threat|audit|vulnerability/i],
] as const;
export function classifySkill(skill: {
  name: string;
  description: string;
  categories?: Array<{ id: string }>;
}) {
  if (skill.categories?.length) return skill.categories.map((c) => c.id);
  const text = skill.name + ' ' + skill.description;
  const found = skillCategories
    .filter(([, , pattern]) => pattern.test(text))
    .map(([id]) => id as string);
  return found.length ? found : ['other'];
}
