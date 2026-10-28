"""Reuse the Android release workflow's counter without outrunning its next build."""
import json
import sys

WORKFLOW = '.github/workflows/android-apk.yml'
OFFSET = 1000
MAX_CODE = 2_100_000_000


def release_build_number(payload):
    runs = payload.get('workflow_runs')
    if not isinstance(runs, list):
        raise ValueError('Android release workflow history is unavailable')
    numbers = []
    for run in runs:
        if run.get('path') != WORKFLOW:
            continue
        number = run.get('run_number')
        if type(number) is not int or number < 1:
            raise ValueError('Invalid Android release workflow counter')
        numbers.append(number)
    if not numbers:
        raise ValueError('No Android release workflow counter found')
    code = OFFSET + max(numbers)
    if code > MAX_CODE:
        raise ValueError('Android version code exceeds the supported maximum')
    return code


if __name__ == '__main__':
    try:
        print(release_build_number(json.load(sys.stdin)))
    except (ValueError, TypeError, AttributeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
