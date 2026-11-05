"""Bounded emulator UI bridge. Allowed input only; never runs a supplied shell command.

The controller publishes synthetic screens to a private QA ref. Password entry
suppresses screenshots until the app process restarts. Backend credentials stay
in a private /tmp fixture file and never enter GitHub commands or evidence.
"""
import base64
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import time

PACKAGE = 'com.feniq.link'
WIDTH, HEIGHT = 720, 1280
ROLES = {'admin', 'owner', 'accountant', 'pharmacy', 'rep', 'new_pharmacy'}
KEYS = {'BACK', 'ENTER', 'HOME', 'TAB'}


def validated(command):
    if not isinstance(command, dict) or type(command.get('id')) is not int or command['id'] < 1:
        raise ValueError('INVALID_COMMAND_ID')
    actions = command.get('actions')
    if not isinstance(actions, list) or not 1 <= len(actions) <= 12:
        raise ValueError('INVALID_ACTION_COUNT')
    for action in actions:
        if not isinstance(action, dict):
            raise ValueError('INVALID_ACTION')
        op = action.get('op')
        if op == 'tap':
            coords = [action.get('x'), action.get('y')]
            if any(type(v) is not int for v in coords) or not (0 <= coords[0] < WIDTH and 0 <= coords[1] < HEIGHT):
                raise ValueError('INVALID_COORDINATE')
        elif op == 'swipe':
            for x, y in [('x1', 'y1'), ('x2', 'y2')]:
                if type(action.get(x)) is not int or type(action.get(y)) is not int or not (0 <= action[x] < WIDTH and 0 <= action[y] < HEIGHT):
                    raise ValueError('INVALID_COORDINATE')
            if type(action.get('duration', 400)) is not int or not 100 <= action.get('duration', 400) <= 2000:
                raise ValueError('INVALID_DURATION')
        elif op == 'text':
            value = action.get('value')
            if not isinstance(value, str) or not 1 <= len(value) <= 160 or not value.isascii() or not value.isprintable():
                raise ValueError('INVALID_TEXT')
        elif op == 'credential':
            if action.get('role') not in ROLES or action.get('field') not in {'phone', 'password'} or action.get('phoneMode', 'full') not in {'full', 'tail'}:
                raise ValueError('INVALID_CREDENTIAL_REFERENCE')
        elif op == 'key':
            if action.get('value') not in KEYS:
                raise ValueError('INVALID_KEY')
        elif op == 'wait':
            if type(action.get('seconds')) is not int or not 1 <= action['seconds'] <= 20:
                raise ValueError('INVALID_WAIT')
        elif op == 'network':
            if action.get('enabled') not in (True, False) or type(action.get('enabled')) is not bool:
                raise ValueError('INVALID_NETWORK_STATE')
        elif op not in {'snapshot', 'restart', 'clear', 'stop'}:
            raise ValueError('UNSUPPORTED_OPERATION')
    return actions


class Review:
    def __init__(self):
        self.repo = os.environ['GITHUB_REPOSITORY']
        self.session = os.environ['FENIQ_UI_SESSION']
        if not re.fullmatch(r'[\w.-]+/[\w.-]+', self.repo) or not re.fullmatch(r'\d+-\d+', self.session):
            raise ValueError('INVALID_SESSION')
        fixture = json.loads(Path(os.environ['FENIQ_ACCEPTANCE_OUTPUT']).read_text())
        if fixture.get('environment') != 'isolated-local-acceptance' or fixture.get('api') != 'http://127.0.0.1:5085/api':
            raise ValueError('LOCAL_FIXTURE_REQUIRED')
        self.accounts = fixture['accounts']
        self.accounts['new_pharmacy'] = {'phone': '0944000201', 'password': 'Gui!' + secrets.token_urlsafe(20) + '9a'}
        self.adb_path = str(Path(os.environ['ANDROID_HOME']) / 'platform-tools' / 'adb')
        self.control = 'qa/android-control-' + self.session
        self.evidence = 'qa/android-evidence-' + self.session
        self.secret_entry = False
        self.last_id = 0
        self.screen = None
        self.history = []
        self.tree = None
        self.head = None

    def github(self, method, route, payload=None):
        args = ['gh', 'api', '--method', method, 'repos/' + self.repo + '/' + route]
        if payload is not None:
            args += ['--input', '-']
        result = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
            text=True, capture_output=True, timeout=45)
        if result.returncode:
            raise RuntimeError('GITHUB_REQUEST_FAILED')
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def adb(self, *args, binary=False):
        result = subprocess.run([self.adb_path, *args], capture_output=True, timeout=90)
        if result.returncode:
            raise RuntimeError('ADB_REQUEST_FAILED')
        return result.stdout if binary else result.stdout.decode(errors='replace')

    def blob(self, data, binary=False):
        return self.github('POST', 'git/blobs', {'content': base64.b64encode(data).decode() if binary else data,
            'encoding': 'base64' if binary else 'utf-8'})['sha']

    def create_ref(self, branch, entries):
        tree = self.github('POST', 'git/trees', {'tree': entries})['sha']
        commit = self.github('POST', 'git/commits', {'message': 'Initialize isolated Android UI review ' + self.session, 'tree': tree, 'parents': []})['sha']
        self.github('POST', 'git/refs', {'ref': 'refs/heads/' + branch, 'sha': commit})
        return commit, tree

    def screen_state(self, error=None, finished=False):
        ui = '<hierarchy review="credential-entry-suppressed" />'
        if not self.secret_entry:
            try:
                self.adb('shell', 'uiautomator', 'dump', '/sdcard/feniq-ui.xml')
                ui = self.adb('shell', 'cat', '/sdcard/feniq-ui.xml')
            except RuntimeError:
                # A busy Flutter/keyboard transition must not lose the session.
                ui = '<hierarchy review="accessibility-unavailable" />'
        for account in self.accounts.values():
            ui = ui.replace(account['password'], '[redacted]')
        if not self.secret_entry:
            self.screen = self.adb('exec-out', 'screencap', '-p', binary=True)
        status = {'session': self.session, 'lastCommand': self.last_id, 'credentialEntryPendingRestart': self.secret_entry,
            'finished': finished, 'error': error, 'production': False, 'debugBuild': True,
            'scope': 'Interactive emulator UI with disposable localhost API; not physical phone/release signing',
            'history': self.history[-160:]}
        entries = [{'path': 'status.json', 'mode': '100644', 'type': 'blob', 'sha': self.blob(json.dumps(status, ensure_ascii=False, indent=2) + '\n')},
            {'path': 'ui.xml', 'mode': '100644', 'type': 'blob', 'sha': self.blob(ui)}]
        if self.screen:
            entries.append({'path': 'screen.png', 'mode': '100644', 'type': 'blob', 'sha': self.blob(self.screen, binary=True)})
            if not self.secret_entry:
                entries.append({'path': 'screens/' + str(self.last_id).zfill(3) + '.png', 'mode': '100644', 'type': 'blob', 'sha': entries[-1]['sha']})
        if not self.head:
            self.head, self.tree = self.create_ref(self.evidence, entries)
        else:
            self.tree = self.github('POST', 'git/trees', {'base_tree': self.tree, 'tree': entries})['sha']
            head = self.github('POST', 'git/commits', {'message': 'Android UI evidence command ' + str(self.last_id), 'tree': self.tree, 'parents': [self.head]})['sha']
            self.github('PATCH', 'git/refs/heads/' + self.evidence, {'sha': head, 'force': False})
            self.head = head

    def text(self, value):
        self.adb('shell', 'input', 'text', shlex.quote(value.replace(' ', '%s')))

    def action(self, action):
        op = action['op']
        if op == 'tap':
            self.adb('shell', 'input', 'tap', str(action['x']), str(action['y']))
        elif op == 'swipe':
            self.adb('shell', 'input', 'swipe', *[str(action[k]) for k in ['x1', 'y1', 'x2', 'y2']], str(action.get('duration', 400)))
        elif op == 'key':
            self.adb('shell', 'input', 'keyevent', 'KEYCODE_' + action['value'])
        elif op == 'clear':
            self.adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
            self.adb('shell', 'input', 'keyevent', *(['KEYCODE_DEL'] * 100))
        elif op == 'text':
            if any(account['password'] in action['value'] for account in self.accounts.values()):
                raise ValueError('USE_PRIVATE_CREDENTIAL_REFERENCE')
            self.text(action['value'])
        elif op == 'credential':
            value = self.accounts[action['role']][action['field']]
            if action['field'] == 'phone' and action.get('phoneMode') == 'tail':
                value = value[2:]
            if action['field'] == 'password':
                self.secret_entry = True
            self.text(value)
        elif op == 'restart':
            self.adb('shell', 'am', 'force-stop', PACKAGE)
            self.adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
            self.secret_entry = False
            time.sleep(5)
        elif op == 'network':
            state = 'enable' if action['enabled'] else 'disable'
            # USB reverse remains available with Wi-Fi/data off. Remove the
            # actual API tunnel too, so offline acceptance really loses HTTP.
            for port in ('5085', '5176'):
                if action['enabled']:
                    self.adb('reverse', 'tcp:' + port, 'tcp:' + port)
                else:
                    self.adb('reverse', '--remove', 'tcp:' + port)
            self.adb('shell', 'svc', 'wifi', state)
            self.adb('shell', 'svc', 'data', state)
        elif op == 'wait':
            time.sleep(action['seconds'])
        time.sleep(0.6)

    def run(self):
        self.adb('reverse', 'tcp:5085', 'tcp:5085')
        self.adb('reverse', 'tcp:5176', 'tcp:5176')
        self.adb('shell', 'wm', 'size', str(WIDTH) + 'x' + str(HEIGHT))
        self.adb('shell', 'wm', 'density', '280')
        self.adb('install', 'phoenix/build/app/outputs/flutter-apk/app-debug.apk')
        self.adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
        time.sleep(10)
        initial = self.blob(json.dumps({'id': 0, 'actions': []}) + '\n')
        self.create_ref(self.control, [{'path': 'command.json', 'mode': '100644', 'type': 'blob', 'sha': initial}])
        self.screen_state()
        print(json.dumps({'ready': True, 'session': self.session, 'control': self.control, 'evidence': self.evidence}), flush=True)
        deadline = time.monotonic() + 2700
        while time.monotonic() < deadline and self.last_id < 160:
            time.sleep(5)
            item = self.github('GET', 'contents/command.json?ref=' + self.control)
            raw = base64.b64decode(item['content'])
            if len(raw) > 20000:
                raise ValueError('COMMAND_TOO_LARGE')
            command = json.loads(raw)
            if type(command.get('id')) is not int or command['id'] <= self.last_id:
                continue
            error, stop = None, False
            try:
                actions = validated(command)
                for action in actions:
                    if action['op'] == 'stop':
                        stop = True
                        break
                    self.action(action)
            except Exception as exception:
                error = type(exception).__name__
            self.last_id = command['id']
            self.history.append({'id': self.last_id, 'ops': [a.get('op') for a in command.get('actions', []) if isinstance(a, dict)], 'error': error})
            self.screen_state(error=error, finished=stop)
            if stop:
                return
        self.screen_state(error='SESSION_TIME_LIMIT', finished=True)


if __name__ == '__main__':
    try:
        Review().run()
    except Exception as error:
        print(json.dumps({'ready': False, 'errorType': type(error).__name__}), flush=True)
        raise SystemExit(1)
