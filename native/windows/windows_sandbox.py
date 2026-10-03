"""Windows AppContainer backend: zero network capabilities, explicit filesystem grants.

No host fallback. A fresh SID per process; only private runtime (RX) and workspace
(M) receive grants. Commands and descendants still belong to ProcessSupervisor's Job.
"""
from pathlib import Path
import hashlib
import ctypes as c
from ctypes import wintypes as w
import os
import shutil
import socket
import subprocess
import sys
import threading
import uuid

RUNTIME = Path(__file__).resolve().parents[2] / '.data' / 'native-python'
_setup_lock = threading.Lock()


def _prepare_runtime():
    """Copy the standard library, never grant access to the user's Python install."""
    if os.name != 'nt':
        raise RuntimeError('Windows AppContainer requires Windows')
    with _setup_lock:
        if (RUNTIME / '.ready').exists() and (RUNTIME / '.ready').read_text(encoding='utf-8') == 'v2:' + sys.version:
            return RUNTIME
        RUNTIME.mkdir(parents=True, exist_ok=True)
        base = Path(sys.base_prefix)
        for pattern in ('python*.exe', '*.dll'):
            for source in base.glob(pattern):
                shutil.copy2(source, RUNTIME / source.name)
        for pattern in ('*ffi*.dll', 'libcrypto*.dll', 'libssl*.dll', 'sqlite*.dll', 'liblzma*.dll', '*bz2*.dll'):
            for source in (base / 'Library' / 'bin').glob(pattern):
                (RUNTIME / 'DLLs').mkdir(exist_ok=True)
                shutil.copy2(source, RUNTIME / 'DLLs' / source.name)
        for folder in ('Lib', 'DLLs'):
            shutil.copytree(base / folder, RUNTIME / folder, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('site-packages', '__pycache__', 'test', 'tests', 'idlelib', 'tkinter'))
        if not (RUNTIME / 'python.exe').exists():
            raise RuntimeError('No compatible Windows Python runtime found')
        (RUNTIME / '.ready').write_text('v2:' + sys.version, encoding='utf-8')
        return RUNTIME


def prepare_runtime():
    if os.name != 'nt':
        raise RuntimeError('Windows AppContainer requires Windows')
    kernel = c.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [c.c_void_p, w.BOOL, w.LPCWSTR]
    kernel.CreateMutexW.restype = w.HANDLE
    kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
    kernel.ReleaseMutex.argtypes = [w.HANDLE]
    kernel.CloseHandle.argtypes = [w.HANDLE]
    mutex = kernel.CreateMutexW(None, False, 'Local\\AgentDemoSetup-' + hashlib.sha256(str(RUNTIME).encode()).hexdigest()[:20])
    if not mutex: raise c.WinError(c.get_last_error())
    acquired = False
    try:
        acquired = kernel.WaitForSingleObject(mutex, 120000) in (0, 0x80)
        if not acquired: raise RuntimeError('Native runtime preparation lock timed out')
        return _prepare_runtime()
    finally:
        if acquired: kernel.ReleaseMutex(mutex)
        kernel.CloseHandle(mutex)


def clean_environment(runtime, workspace):
    """Allowlist, not a blacklist of known API key names."""
    system = os.environ.get('SystemRoot', r'C:\Windows')
    temp = Path(workspace) / '.sandbox-tmp'
    temp.mkdir(exist_ok=True)
    return {'SystemRoot': system, 'WINDIR': system,
            'PATH': str(runtime) + ';' + system + r'\System32',
            'LOCALAPPDATA': os.environ.get('LOCALAPPDATA', str(temp)),
            'COMSPEC': system + r'\System32\cmd.exe',
            'TEMP': str(temp), 'TMP': str(temp),
            'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1',
            'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1'}


class STARTUPINFO(c.Structure):
    _fields_ = [('cb', w.DWORD), ('reserved', w.LPWSTR), ('desktop', w.LPWSTR),
                ('title', w.LPWSTR)] + [(n, w.DWORD) for n in
                ('x', 'y', 'xsize', 'ysize', 'xchars', 'ychars', 'fill', 'flags')] + [
                ('show', w.WORD), ('reserved_size', w.WORD), ('reserved2', c.c_void_p),
                ('stdin', w.HANDLE), ('stdout', w.HANDLE), ('stderr', w.HANDLE)]


class STARTUPINFOEX(c.Structure):
    _fields_ = [('si', STARTUPINFO), ('attributes', c.c_void_p)]


class PROCESSINFO(c.Structure):
    _fields_ = [('process', w.HANDLE), ('thread', w.HANDLE), ('pid', w.DWORD), ('tid', w.DWORD)]


class CAPABILITIES(c.Structure):
    _fields_ = [('sid', c.c_void_p), ('capabilities', c.c_void_p),
                ('count', w.DWORD), ('reserved', w.DWORD)]


class NativeProcess:
    """Minimal Popen interface; launch suspended, supervisor attaches Job before resume."""
    def __init__(self, command, workspace, cwd, stream, network_policy='deny'):
        if network_policy not in {'deny', 'host'}:
            raise ValueError('native network policy must be deny or host')
        if os.name != 'nt':
            raise RuntimeError('Windows native sandbox unavailable')
        import msvcrt
        self.k = c.WinDLL('kernel32', use_last_error=True)
        self.u = c.WinDLL('userenv', use_last_error=True)
        self.a = c.WinDLL('advapi32', use_last_error=True)
        self._handle = None
        self.listener = None
        self.stdin = None
        self.returncode = None
        self.name = 'AgentDemo.' + uuid.uuid4().hex
        self.sid = c.c_void_p()
        self.grants = []
        self.profile_created = False
        self._bind()
        inherited = []
        read_fd = None
        attribute_buffer = None
        try:
            runtime = prepare_runtime()
            workspace = Path(workspace).resolve()
            if runtime.is_relative_to(workspace):
                raise RuntimeError('工作区不能包含沙箱运行时；请选择项目的 workspace 子目录')
            # Reparse points can redirect an ACL grant; refuse before changing any ACL.
            protected_metadata = []
            for root in (workspace, runtime):
                for folder, dirs, files in os.walk(root, followlinks=False):
                    for name in dirs + files:
                        p = Path(folder) / name
                        if root == workspace and name.lower() in {'.git', '.agentdemo'}:
                            protected_metadata.append(p)
                        if p.is_symlink() or p.stat(follow_symlinks=False).st_file_attributes & 0x400 or (p.is_file() and p.stat().st_nlink > 1):
                            raise RuntimeError('原生沙箱暂不支持工作区或运行时中的重解析点或硬链接')
            if protected_metadata:
                raise RuntimeError('PROTECTED_METADATA: Native metadata denial is not verified on this backend. Use a clean isolated copy without .git or .agentdemo; requested command was not started.')
            hr = self.u.CreateAppContainerProfile(self.name, self.name, 'AgentDemo sandbox', None, 0, c.byref(self.sid))
            if hr < 0:
                raise OSError(f'CreateAppContainerProfile failed: 0x{hr & 0xffffffff:08x}')
            self.profile_created = True
            sid_text = w.LPWSTR()
            if not self.a.ConvertSidToStringSidW(self.sid, c.byref(sid_text)):
                raise c.WinError(c.get_last_error())
            self.sid_text = sid_text.value
            self.k.LocalFree(c.cast(sid_text, c.c_void_p))
            environment = clean_environment(runtime, workspace)
            for root, rights in ((runtime, 'RX'), (workspace, 'M')):
                self.grants.append(root)
                self._acl(root, '/grant', f'*{self.sid_text}:(OI)(CI)({rights})')
            read_fd, write_fd = os.pipe()
            self.stdin = os.fdopen(write_fd, 'wb', buffering=0)
            for fd in (read_fd, stream.fileno()):
                duplicate = w.HANDLE()
                current = self.k.GetCurrentProcess()
                if not self.k.DuplicateHandle(current, msvcrt.get_osfhandle(fd), current,
                                             c.byref(duplicate), 0, True, 2):
                    raise c.WinError(c.get_last_error())
                inherited.append(duplicate.value)
            size = c.c_size_t()
            self.k.InitializeProcThreadAttributeList(None, 2, 0, c.byref(size))
            attribute_buffer = c.create_string_buffer(size.value)
            if not self.k.InitializeProcThreadAttributeList(attribute_buffer, 2, 0, c.byref(size)):
                raise c.WinError(c.get_last_error())
            caps = CAPABILITIES(self.sid, None, 0, 0)  # no internet or private-network capability
            handles = (w.HANDLE * len(inherited))(*inherited)
            for key, value in ((0x20009, caps), (0x20002, handles)):
                if not self.k.UpdateProcThreadAttribute(attribute_buffer, 0, key, c.byref(value), c.sizeof(value), None, None):
                    raise c.WinError(c.get_last_error())
            startup = STARTUPINFOEX()
            startup.si.cb = c.sizeof(startup)
            startup.si.flags = 0x100
            startup.si.stdin, startup.si.stdout, startup.si.stderr = inherited[0], inherited[1], inherited[1]
            startup.attributes = c.cast(attribute_buffer, c.c_void_p)
            info = PROCESSINFO()
            env = c.create_unicode_buffer('\0'.join(f'{k}={v}' for k, v in sorted(environment.items())) + '\0\0')
            shell = environment['COMSPEC']
            if network_policy == 'deny':
                # Check the actual OS boundary before running any untrusted command.
                self.listener = socket.socket()
                self.listener.bind(('127.0.0.1', 0))
                self.listener.listen(1)
                port = self.listener.getsockname()[1]
                bootstrap = (
                    "import socket,subprocess,sys,json\n"
                    "def report(ok,reason,code=None):\n"
                    " print('AGENTDEMO_PREFLIGHT '+json.dumps(dict(allowed=ok,reason=reason,errorCode=code)),flush=True)\n"
                    "try:\n"
                    f" s=socket.create_connection(('127.0.0.1',{port}),2);s.close()\n"
                    "except OSError as e:\n"
                    " code=getattr(e,'winerror',None) or e.errno\n"
                    " if code!=10013:\n"
                    "  report(False,type(e).__name__+': '+str(e),code);sys.exit(197)\n"
                    "else:\n"
                    " report(False,'Loopback connection succeeded');sys.exit(197)\n"
                    "report(True,'Loopback denied by OS',10013)\n"
                    f"sys.exit(subprocess.call({command!r},shell=True))\n"
                )
                shell = str(runtime / 'python.exe')
                line = c.create_unicode_buffer(subprocess.list2cmdline([shell, '-I', '-S', '-c', bootstrap]))
            else:
                line = c.create_unicode_buffer(f'"{shell}" /d /s /c "{command}"')
            if not self.k.CreateProcessW(shell, line, None, None, True,
                    0x80000 | 0x400 | 0x4 | 0x08000000, env, str(cwd), c.byref(startup), c.byref(info)):
                raise c.WinError(c.get_last_error())
            self._handle, self.pid = info.process, info.pid
            self.k.CloseHandle(info.thread)
        except BaseException:
            self.close()
            raise
        finally:
            if attribute_buffer is not None:
                self.k.DeleteProcThreadAttributeList(attribute_buffer)
            for handle in inherited:
                self.k.CloseHandle(handle)
            if read_fd is not None:
                os.close(read_fd)

    def _bind(self):
        bindings = {
            'CreateMutexW': ([c.c_void_p, w.BOOL, w.LPCWSTR], w.HANDLE),
            'ReleaseMutex': ([w.HANDLE], w.BOOL),
            'CloseHandle': ([w.HANDLE], w.BOOL), 'GetCurrentProcess': ([], w.HANDLE),
            'LocalFree': ([c.c_void_p], c.c_void_p),
            'DuplicateHandle': ([w.HANDLE, w.HANDLE, w.HANDLE, c.POINTER(w.HANDLE), w.DWORD, w.BOOL, w.DWORD], w.BOOL),
            'InitializeProcThreadAttributeList': ([c.c_void_p, w.DWORD, w.DWORD, c.POINTER(c.c_size_t)], w.BOOL),
            'UpdateProcThreadAttribute': ([c.c_void_p, w.DWORD, c.c_size_t, c.c_void_p, c.c_size_t, c.c_void_p, c.c_void_p], w.BOOL),
            'DeleteProcThreadAttributeList': ([c.c_void_p], None),
            'CreateProcessW': ([w.LPCWSTR, w.LPWSTR, c.c_void_p, c.c_void_p, w.BOOL, w.DWORD, c.c_void_p, w.LPCWSTR, c.c_void_p, c.POINTER(PROCESSINFO)], w.BOOL),
            'GetExitCodeProcess': ([w.HANDLE, c.POINTER(w.DWORD)], w.BOOL),
            'WaitForSingleObject': ([w.HANDLE, w.DWORD], w.DWORD),
            'TerminateProcess': ([w.HANDLE, w.UINT], w.BOOL),
        }
        for name, (args, ret) in bindings.items():
            fn = getattr(self.k, name); fn.argtypes = args; fn.restype = ret
        self.u.CreateAppContainerProfile.argtypes = [w.LPCWSTR, w.LPCWSTR, w.LPCWSTR, c.c_void_p, w.DWORD, c.POINTER(c.c_void_p)]
        self.u.CreateAppContainerProfile.restype = c.c_long
        self.u.DeleteAppContainerProfile.argtypes = [w.LPCWSTR]
        self.u.DeleteAppContainerProfile.restype = c.c_long
        self.a.ConvertSidToStringSidW.argtypes = [c.c_void_p, c.POINTER(w.LPWSTR)]
        self.a.FreeSid.argtypes = [c.c_void_p]

    def _acl(self, path, action, value):
        name = 'Local\\AgentDemoAcl-' + hashlib.sha256(str(RUNTIME).encode()).hexdigest()[:20]
        mutex = self.k.CreateMutexW(None, False, name)
        if not mutex:
            raise c.WinError(c.get_last_error())
        acquired = False
        try:
            state = self.k.WaitForSingleObject(mutex, 30000)
            if state not in (0, 0x80):
                raise RuntimeError('Sandbox ACL coordination timed out')
            acquired = True
            result = subprocess.run(['icacls', str(path), action, value, '/q'], capture_output=True, timeout=30)
            if result.returncode:
                raise RuntimeError('Sandbox ACL update failed: ' + result.stderr.decode(errors='replace'))
        finally:
            if acquired:
                self.k.ReleaseMutex(mutex)
            self.k.CloseHandle(mutex)

    def poll(self):
        code = w.DWORD()
        if self.returncode is None:
            if not self.k.GetExitCodeProcess(self._handle, c.byref(code)):
                raise c.WinError(c.get_last_error())
            if self.k.WaitForSingleObject(self._handle, 0) == 0:
                self.returncode = code.value
        return self.returncode

    def wait(self, timeout=None):
        result = self.k.WaitForSingleObject(self._handle, 0xffffffff if timeout is None else int(timeout * 1000))
        if result == 258:
            raise subprocess.TimeoutExpired('AppContainer', timeout)
        return self.poll()

    def kill(self):
        if self._handle:
            self.k.TerminateProcess(self._handle, 1)

    def close(self):
        errors = []
        if self.listener:
            self.listener.close()
            self.listener = None
        if self.stdin:
            self.stdin.close()
        if self._handle:
            self.k.CloseHandle(self._handle)
            self._handle = None
        for root in reversed(self.grants):
            try:
                self._acl(root, '/remove:g', '*' + self.sid_text)
            except Exception as exc:
                errors.append(str(exc))
        self.grants.clear()
        if self.profile_created:
            hr = self.u.DeleteAppContainerProfile(self.name)
            if hr < 0:
                errors.append(f'DeleteAppContainerProfile: {hr}')
            self.profile_created = False
        if self.sid:
            self.a.FreeSid(self.sid)
            self.sid = c.c_void_p()
        if errors:
            raise RuntimeError('; '.join(errors))
