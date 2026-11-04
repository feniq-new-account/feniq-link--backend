const env = require('../../config/env');
const { SmsProvider } = require('./smsProvider');

// The development transport, and the default: it prints the message instead
// of sending it, so the whole OTP flow (forgot password -> code -> reset) is
// exercisable end to end with no gateway account and no cost.
//
// This is the behaviour otp.service.js had inline before the provider
// interface existed - moved here unchanged, including the log format, so
// existing local workflows that read the code off the server log keep working.
//
// Development only. Anywhere else (production on Render, staging, test) the
// message body is NOT printed: it carries a live verification code, and
// anyone who can read the platform's logs would otherwise be able to reset
// any pharmacy's password. Outside development this provider logs only that
// a message was suppressed, with the number masked, so "the user says no
// code arrived" is still diagnosable. Until a real gateway exists, password
// recovery in production goes through the admin panel's reset button.
function maskPhone(phone) {
  const value = String(phone ?? '');
  if (value.length <= 4) return '****';
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

class ConsoleSmsProvider extends SmsProvider {
  get name() {
    return 'console';
  }

  get canDeliver() {
    return env.nodeEnv === 'development';
  }

  async send(phone, message) {
    if (env.nodeEnv === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[SMS -> ${phone}] ${message}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[SMS -> ${maskPhone(phone)}] not sent: no SMS gateway configured (SMS_PROVIDER=console); message body withheld outside development.`
    );
  }
}

module.exports = { ConsoleSmsProvider, maskPhone };
