"""Real local HTTP/React acceptance. Credentials and tokens never enter the report.

The five backend identities are exercised; browser UI covers admin/owner/accountant.
This does not claim Android/physical-phone acceptance for the other three roles.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--web', default='http://127.0.0.1:5176')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    fixture = json.loads(Path(args.credentials).read_text())
    assert fixture['environment'] == 'isolated-local-acceptance'
    assert urlparse(fixture['api']).hostname in ('localhost', '127.0.0.1')
    assert urlparse(args.web).hostname in ('localhost', '127.0.0.1')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    errors, checks = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,
            executable_path=os.environ.get('FENIQ_CHROMIUM', '/usr/bin/chromium') or None,
            args=['--no-sandbox'])
        api = p.request.new_context(base_url=fixture['api'] + '/')
        sessions = {}
        for role, account in fixture['accounts'].items():
            response = api.post('auth/login-password', data={'phone': account['phone'], 'password': account['password']})
            assert response.status == 200, f'{role} password login: {response.status}'
            sessions[role] = response.json()
            own = api.get('auth/me', headers={'authorization': 'Bearer ' + sessions[role]['token']})
            assert own.status == 200 and own.json()['user']['id'] == sessions[role]['user']['id']
        checks.append('five role identities login and restore via real API')

        def request(role, method, route, body=None):
            options = {'headers': {'authorization': 'Bearer ' + sessions[role]['token']}}
            if body is not None:
                options['data'] = body
            return api.fetch(route, method=method, **options)

        assert sessions['owner']['user']['permissions']['paymentRecord'] is False
        assert sessions['accountant']['user']['permissions']['paymentRecord'] is True
        assert request('owner', 'POST', 'warehouse/payments', {}).status == 403
        assert request('rep', 'GET', 'admin/feature-control').status == 403
        assert request('pharmacy', 'GET', 'admin/feature-control').status == 403
        checks.append('cash role and platform authorization are enforced by server')

        # Inspect actual DOM after load; do not intercept any API response.
        def login_ui(role, width, route):
            context = browser.new_context(viewport={'width': width, 'height': 900})
            context.add_init_script("localStorage.setItem('i18nextLng','ar');localStorage.setItem('phoenix_lang','ar');")
            context.route('**/*', lambda r: r.continue_() if urlparse(r.request.url).hostname in ('localhost', '127.0.0.1') else r.abort())
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.web + route)
            page.wait_for_load_state('networkidle')
            page.locator('#phone').fill(fixture['accounts'][role]['phone'])
            page.locator('#password').fill(fixture['accounts'][role]['password'])
            page.locator('button[type=submit]').click()
            page.wait_for_selector('.admin-shell, .warehouse-shell', timeout=30000)
            page.wait_for_load_state('networkidle')
            return context, page

        for width in (390, 1440):
            context, page = login_ui('admin', width, '/admin/features')
            center = page.locator('.feature-control-center')
            center.get_by_text('مفاتيح المنصة لجميع المستودعات', exact=True).wait_for()
            before = request('admin', 'GET', 'admin/feature-control').json()['platform']
            center.get_by_label('سبب التعديل', exact=True).fill('قبول محلي مع API حقيقي')
            checkbox = center.locator('input[type=checkbox]').first
            target = not checkbox.is_checked()
            checkbox.set_checked(target)
            center.get_by_role('button', name='حفظ مفاتيح المنصة', exact=True).click()
            center.get_by_text('تم الحفظ وتحديث الحقوق.', exact=True).wait_for()
            after = request('admin', 'GET', 'admin/feature-control').json()['platform']
            assert after['revision'] == before['revision'] + 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(output / f'admin-real-api-{width}.png'), full_page=True)
            restored = request('admin', 'PUT', 'admin/feature-control', {'revision': after['revision'],
                'reason': 'انتهاء اختبار الواجهة المحلي', 'features': before['features']})
            assert restored.status == 200
            context.close()
        checks.append('Arabic admin global saves persist revision and audit at 390/1440px')

        context, page = login_ui('owner', 390, '/warehouse/settings')
        page.get_by_role('button', name='عرض تفضيلات الميزات', exact=True).click()
        card = page.locator('.feature-control-center')
        card.get_by_label('سبب التعديل', exact=True).fill('قبول تفضيلات المالك محليًا')
        rights_before = request('owner', 'GET', 'warehouse/entitlements').json()
        card.locator('input[type=checkbox]').first.uncheck()
        card.get_by_role('button', name='حفظ', exact=True).click()
        page.get_by_text('تم الحفظ وتحديث صلاحيات الميزات في اللوحة.', exact=True).wait_for()
        rights_after = request('owner', 'GET', 'warehouse/entitlements').json()
        assert rights_after['revision'] == rights_before['revision'] + 1
        page.screenshot(path=str(output / 'owner-preferences-real-api-390.png'), full_page=True)
        page.goto(args.web + '/warehouse/debts')
        page.wait_for_load_state('networkidle')
        assert page.locator('.wh-voice-btn').count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        context.close()
        checks.append('owner preferences persist while owner cash remains denied')

        context, page = login_ui('accountant', 390, '/warehouse/debts')
        page.locator('.wh-voice-btn').wait_for()
        assert request('accountant', 'GET', 'warehouse/balances').status == 200
        assert request('accountant', 'PUT', 'warehouse/entitlements/configuration',
            {'revision': rights_after['revision'], 'reason': 'accountant cannot grant', 'features': {}}).status == 403
        page.screenshot(path=str(output / 'accountant-real-api-390.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        me_url = fixture['api'] + '/auth/me'
        context.route(me_url, lambda route: route.abort())
        page.reload()
        retry = page.get_by_role('button', name='إعادة المحاولة', exact=True)
        retry.wait_for()
        assert page.evaluate("localStorage.getItem('phoenix.admin.token') !== null")
        context.unroute(me_url)
        retry.click()
        page.locator('.warehouse-shell').wait_for()
        page.locator('.wh-voice-btn').wait_for()
        context.close()
        checks.append('accountant retains basic account read but cannot configure entitlements')
        checks.append('interrupted session check keeps login and recovers without reauthentication')
        events = request('admin', 'GET', 'admin/feature-control/audit').json()['events']
        assert len(events) >= 5
        checks.append('control writes produce real audit records')
        assert not errors, '\n'.join(errors)
        api.dispose()
        browser.close()
    report = {'passed': checks, 'pageErrors': errors, 'api': 'disposable localhost API',
        'browserUi': ['admin', 'warehouse owner', 'accountant'],
        'notTested': ['physical Android', 'logged-in signed APK upgrade', 'production health', 'external map/image delivery'],
        'productionDataTouched': False}
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
