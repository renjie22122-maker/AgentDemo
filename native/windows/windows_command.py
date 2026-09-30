"""Avoid cmd.exe silently dropping lines inside Python -c arguments."""
import base64
import re


def prepare(command):
    if not isinstance(command, str) or not any(c in command for c in '\r\n'):
        return command
    match = re.fullmatch(r'(python(?:3|\.exe)?(?:\s+-(?:u|I|S))*\s+-c)\s+"(.*)"\s*', command.strip(), re.S)
    if not match or '"' in match[2]:
        raise ValueError('WINDOWS_MULTILINE: 为避免 cmd.exe 静默丢失后续行，多行或复合命令请先 write_file 写入脚本，再执行 python -u script.py；本命令尚未执行。')
    payload = base64.b64encode(match[2].encode('utf-8')).decode('ascii')
    return match[1] + ' "import base64;exec(compile(base64.b64decode(\'' + payload + '\'),\'<agent-command>\',\'exec\'))"'
