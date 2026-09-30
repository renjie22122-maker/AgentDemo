"""AgentDemo Windows isolation adapter. One request; stdin EOF cancels owned work."""
import json, sys, time, threading, tempfile, os
from pathlib import Path
from windows_sandbox import NativeProcess
from windows_job import WindowsJob
from windows_command import prepare

command_started = False

def main():
    global command_started
    request = json.loads(sys.stdin.readline())
    cancelled = threading.Event()
    def watch():
        sys.stdin.readline()
        cancelled.set()
    threading.Thread(target=watch, daemon=True).start()
    process = None
    job = WindowsJob(restricted=True)
    timed_out = False
    truncated = False
    try:
        with tempfile.TemporaryFile() as output:
            process = NativeProcess(prepare(request['command']), request['cwd'], request['cwd'],
                                    output, network_policy=request.get('network', 'deny'))
            command_started = True  # conservative: failure while attaching/resuming may have started work
            job.attach_resume(process)
            start = time.monotonic()
            while process.poll() is None:
                timed_out = time.monotonic() - start > request['timeoutMs'] / 1000
                truncated = os.fstat(output.fileno()).st_size > 1000000
                if cancelled.is_set() or timed_out or truncated:
                    break
                time.sleep(.03)
            job.close()
            process.wait(timeout=10)
            code = process.poll()
            output.seek(0)
            data = output.read(1000000).decode('utf-8', errors='replace')
        process.close()
        process = None
        result = dict(code=code, stdout=data, stderr='', timedOut=timed_out, truncated=truncated)
        if request.get('network', 'deny') == 'deny':
            first, separator, rest = data.partition('\n')
            if first.startswith('AGENTDEMO_PREFLIGHT '):
                preflight = json.loads(first[len('AGENTDEMO_PREFLIGHT '):])
                result['preflight'] = preflight
                result['commandStarted'] = bool(preflight['allowed'])
                result['stdout'] = rest
                if not preflight['allowed']:
                    result['stdout'] = 'SANDBOX_PREFLIGHT_FAILED: network denial not confirmed; ' + preflight['reason'] + '; errorCode=' + str(preflight['errorCode'])
        return result
    finally:
        job.close()
        if process:
            process.kill()
            process.close()

if __name__ == '__main__':
    try:
        result = main()
    except Exception as error:
        result = dict(error=type(error).__name__ + ': ' + str(error), commandStarted=command_started)
    print(json.dumps(result), flush=True)
