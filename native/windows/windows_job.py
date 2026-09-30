class WindowsJob:
    """先挂入 Job 再恢复进程；关闭 Job 时终止所有后代。"""
    def __init__(self, restricted=False):
        import ctypes as c
        from ctypes import wintypes as w
        class Basic(c.Structure):
            _fields_ = [('process_time', c.c_int64), ('job_time', c.c_int64),
                        ('flags', w.DWORD), ('min_ws', c.c_size_t), ('max_ws', c.c_size_t),
                        ('active', w.DWORD), ('affinity', c.c_size_t),
                        ('priority', w.DWORD), ('scheduling', w.DWORD)]
        class IO(c.Structure):
            _fields_ = [(name, c.c_uint64) for name in ('read_ops', 'write_ops', 'other_ops',
                                                      'read_bytes', 'write_bytes', 'other_bytes')]
        class Extended(c.Structure):
            _fields_ = [('basic', Basic), ('io', IO), ('process_memory', c.c_size_t),
                        ('job_memory', c.c_size_t), ('peak_process', c.c_size_t),
                        ('peak_job', c.c_size_t)]
        self.c = c
        self.k = c.WinDLL('kernel32', use_last_error=True)
        self.k.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
        self.k.CreateJobObjectW.restype = w.HANDLE
        self.k.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
        self.k.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.k.CloseHandle.argtypes = [w.HANDLE]
        self.handle = self.k.CreateJobObjectW(None, None)
        if not self.handle:
            raise c.WinError(c.get_last_error())
        info = Extended()
        info.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if restricted:
            info.basic.flags |= 0x8 | 0x200  # active-process and job-memory limits
            info.basic.active = 32
            info.job_memory = 512 * 1024 * 1024
        if not self.k.SetInformationJobObject(self.handle, 9, c.byref(info), c.sizeof(info)):
            self.close()
            raise c.WinError(c.get_last_error())

    def attach_resume(self, proc):
        if not self.k.AssignProcessToJobObject(self.handle, int(proc._handle)):
            raise self.c.WinError(self.c.get_last_error())
        nt = self.c.WinDLL('ntdll')
        nt.NtResumeProcess.argtypes = [self.c.c_void_p]
        nt.NtResumeProcess.restype = self.c.c_long
        if nt.NtResumeProcess(int(proc._handle)) != 0:
            raise RuntimeError('无法恢复已隔离进程')

    def close(self):
        if self.handle:
            self.k.CloseHandle(self.handle)
            self.handle = None
