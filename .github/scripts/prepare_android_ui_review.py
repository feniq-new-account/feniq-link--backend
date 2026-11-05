"""Mutates only the throwaway CI checkout, never a release configuration."""
from pathlib import Path
import os
import shutil
import xml.etree.ElementTree as ET


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('This preparation is only for the disposable CI checkout.')
    root = Path(__file__).resolve().parents[2] / 'phoenix' / 'android' / 'app'
    firebase = root / 'google-services.json'
    if firebase.exists():
        shutil.move(str(firebase), str(Path(os.environ['RUNNER_TEMP']) / 'ui-review-google-services.json'))
    ns = 'http://schemas.android.com/apk/res/android'
    ET.register_namespace('android', ns)
    manifest = root / 'src' / 'debug' / 'AndroidManifest.xml'
    tree = ET.parse(manifest)
    application = tree.getroot().find('application')
    if application is None:
        application = ET.SubElement(tree.getroot(), 'application')
    application.set('{' + ns + '}networkSecurityConfig', '@xml/qa_localhost_security')
    resource = root / 'src' / 'debug' / 'res' / 'xml' / 'qa_localhost_security.xml'
    resource.parent.mkdir(parents=True, exist_ok=True)
    resource.write_text('''<network-security-config>
<base-config cleartextTrafficPermitted="false" />
<domain-config cleartextTrafficPermitted="true"><domain>127.0.0.1</domain><domain>localhost</domain></domain-config>
</network-security-config>\n''')
    tree.write(manifest, encoding='unicode')


if __name__ == '__main__':
    main()
