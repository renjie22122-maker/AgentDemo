import type { ToolSpec } from '../../shared/types.js';
export const coreTools = new Set([
  'glob',
  'grep',
  'search_tools',
  'search_capabilities',
  'batch_read_tools',
  'list_files',
  'read_file',
  'read_json',
  'write_file',
  'edit_file',
  'apply_patch',
  'inspect_file_version',
  'run_command',
  'background_commands',
  'wait_background_command',
  'ask_user',
  'read_image',
  'web_search',
  'fetch_url',
  'read_web_evidence',
  'find_skills',
  'read_skill',
  'search_knowledge',
  'read_spill',
  'inspect_operations',
  'resolve_effect',
  'create_plan',
  'inspect_plan',
  'update_plan',
  'spawn_agent',
  'list_agents',
  'continue_agent',
  'wait_agents',
]);
export function findTools(specs: ToolSpec[], query: string, offset: number, limit: number) {
  const aliases: Record<string, string> = {
    浏览器: 'browser mcp',
    桌面: 'computer mcp',
    截图: 'screenshot image mcp',
    网页: 'web fetch',
    搜索: 'search grep',
    文件: 'file glob',
    技能: 'skill',
    记忆: 'memory',
    知识库: 'knowledge',
    工作流: 'workflow',
    批量: 'batch',
    终端: 'command bash',
    图片: 'image',
    视频: 'video media',
    团队: 'team agent',
  };
  const expanded =
    query +
    ' ' +
    Object.entries(aliases)
      .filter(([k]) => query.includes(k))
      .map(([, v]) => v)
      .join(' ');
  const terms = expanded
    .toLowerCase()
    .split(/[\s_\-]+/)
    .filter(Boolean);
  const ranked = specs
    .map((tool) => {
      const name = tool.name.toLowerCase(),
        hay = (name + ' ' + tool.description + ' ' + tool.effect).toLowerCase();
      return {
        tool,
        score: terms.reduce(
          (n, t) => n + (name === t ? 20 : name.includes(t) ? 5 : hay.includes(t) ? 1 : 0),
          0,
        ),
      };
    })
    .filter((x) => !terms.length || x.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return { total: ranked.length, results: ranked.slice(offset, offset + limit).map((x) => x.tool) };
}
